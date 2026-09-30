/**
 * Streaming HTML reader that throws away the bulk of heavy pages as it reads.
 *
 * Some sites (Wix in particular) ship ~2.4 MB of HTML where ~1.4 MB is inline
 * <style> and ~0.5 MB is <script>, mostly before the real content. Capping the
 * raw download at 1 MiB then cuts the page off before its first image or
 * heading. Here only what we KEEP counts toward the cap, so the content is
 * reachable while memory stays bounded: the contents of <style> and <script>
 * elements are discarded chunk by chunk, never buffered. Opening and closing
 * tags stay (emptied), and <script type="application/ld+json"> keeps its
 * contents because structured data lives there.
 */

const DEFAULT_MAX_KEPT_CHARS = 1024 * 1024;
/** Stops a pathological page from streaming forever. */
const DEFAULT_MAX_RAW_BYTES = 10 * 1024 * 1024;
/** Bot-challenge markers can sit inside scripts, so keep an unstripped start. */
const RAW_SNIPPET_CHARS = 4_000;
/** "<script" plus the character after it is the longest partial tag to hold back. */
const PARTIAL_TAG_CHARS = 8;
/** An opening tag with no ">" after this many characters is treated as text. */
const MAX_OPENING_TAG_CHARS = 16 * 1024;

const BULK_OPENER = /<(style|script)(?=[\s>/])/i;
const LD_JSON_TYPE = /\btype\s*=\s*["']?application\/ld\+json/i;
const CLOSERS = { style: /<\/style/i, script: /<\/script/i };

/** Where a partial tag at the end of `text` starts, so the next chunk can finish it. */
function partialTagStart(text: string): number {
  const lastOpen = text.lastIndexOf("<");
  return lastOpen !== -1 && text.length - lastOpen < PARTIAL_TAG_CHARS
    ? lastOpen
    : text.length;
}

/**
 * A three-state scanner fed decoded text: normal HTML, inside an element whose
 * contents are dropped, and inside one whose contents are kept. The contents
 * of <style> and <script> are raw text that ends only at the matching closing
 * tag, so a "<script" inside script data is not a new element. A tag split
 * across two chunks is held back until the next one arrives.
 */
function createScanner() {
  let mode: "html" | "drop" | "keep" = "html";
  let closer = CLOSERS.script;
  let pending = "";

  return function scan(chunk: string, final: boolean): string {
    let text = pending + chunk;
    pending = "";
    let out = "";

    while (text.length > 0) {
      if (mode === "html") {
        const opener = BULK_OPENER.exec(text);
        if (!opener) {
          const cut = final ? text.length : partialTagStart(text);
          out += text.slice(0, cut);
          pending = text.slice(cut);
          break;
        }
        const tagEnd = text.indexOf(">", opener.index);
        if (tagEnd === -1) {
          if (final || text.length - opener.index >= MAX_OPENING_TAG_CHARS) {
            out += text; // not a real tag: keep it as text
          } else {
            out += text.slice(0, opener.index);
            pending = text.slice(opener.index);
          }
          break;
        }
        const isScript = opener[1].toLowerCase() === "script";
        const isLdJson =
          isScript && LD_JSON_TYPE.test(text.slice(opener.index, tagEnd));
        out += text.slice(0, tagEnd + 1);
        text = text.slice(tagEnd + 1);
        mode = isLdJson ? "keep" : "drop";
        closer = isScript ? CLOSERS.script : CLOSERS.style;
        continue;
      }

      const closerAt = text.search(closer);
      if (closerAt === -1) {
        const cut = final ? text.length : partialTagStart(text);
        if (mode === "keep") out += text.slice(0, cut);
        pending = text.slice(cut);
        break;
      }
      if (mode === "keep") out += text.slice(0, closerAt);
      text = text.slice(closerAt); // the closing tag itself is kept as HTML
      mode = "html";
    }
    return out;
  };
}

export async function readHtmlWithoutBulk(
  response: Response,
  {
    maxKeptChars = DEFAULT_MAX_KEPT_CHARS,
    maxRawBytes = DEFAULT_MAX_RAW_BYTES,
  }: { maxKeptChars?: number; maxRawBytes?: number } = {},
): Promise<{
  /** The page with style and script contents removed, capped at maxKeptChars. */
  body: string;
  /** The first ~4,000 characters exactly as served, for bot-challenge checks. */
  rawSnippet: string;
}> {
  if (!response.body) return { body: "", rawSnippet: "" };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const scan = createScanner();
  const parts: string[] = [];
  let keptChars = 0;
  let rawBytes = 0;
  let rawSnippet = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      const text = done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      if (!done) rawBytes += value.byteLength;
      if (rawSnippet.length < RAW_SNIPPET_CHARS) {
        rawSnippet += text.slice(0, RAW_SNIPPET_CHARS - rawSnippet.length);
      }

      const kept = scan(text, done);
      parts.push(kept);
      keptChars += kept.length;

      if (done) break;
      if (keptChars >= maxKeptChars || rawBytes >= maxRawBytes) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { body: parts.join("").slice(0, maxKeptChars), rawSnippet };
}
