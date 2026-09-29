/**
 * Breaks a page (or a draft) down into the outline the draft benchmark compares:
 * title, meta description, H1, H2/H3 text in order, word count, structured data
 * types, image count and a budgeted slice of body text.
 *
 * Built on htmlparser2's tokenizer like the audit's page analyzer, but kept
 * separate: the audit keeps heading levels without their text, and changing it
 * risks the audit engine's memory limits.
 */
import { Parser } from "htmlparser2";
import type { PageOutline } from "@/types/schemas/draftBenchmark";

/** Subtrees whose text isn't the page's own content. */
const NON_CONTENT_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "nav",
  "footer",
]);
const HEADING_TAGS = new Set(["h1", "h2", "h3"]);
const MAX_HEADINGS = 80;
const MAX_HEADING_CHARS = 200;
const BODY_TEXT_CHAR_BUDGET = 6_000;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Collects the `@type` values from a JSON-LD document, including `@graph`. */
function collectSchemaTypes(node: unknown, found: Set<string>) {
  if (Array.isArray(node)) {
    for (const child of node) collectSchemaTypes(child, found);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const type: unknown = Reflect.get(node, "@type");
  if (typeof type === "string") found.add(type);
  else if (Array.isArray(type)) {
    for (const entry of type) if (typeof entry === "string") found.add(entry);
  }
  collectSchemaTypes(Reflect.get(node, "@graph"), found);
}

/**
 * `bodyCharBudget` lets callers skip body text entirely (0) when the caller
 * already holds it, as with a draft Claude has just been given.
 */
export function extractPageOutline(
  html: string,
  bodyCharBudget = BODY_TEXT_CHAR_BUDGET,
): PageOutline {
  const titleParts: string[] = [];
  let titleDepth = 0;
  let metaDescription: string | null = null;
  let h1: string | null = null;
  const headings: PageOutline["headings"] = [];
  let openHeading: { level: number; parts: string[] } | null = null;
  let imageCount = 0;
  const schemaTypes = new Set<string>();
  const bodyParts: string[] = [];

  let suppressDepth = 0;
  let headDepth = 0;
  let jsonLdParts: string[] | null = null;

  const parser = new Parser({
    onopentag(name, attribs) {
      if (name === "script" && attribs["type"] === "application/ld+json") {
        jsonLdParts = [];
      }
      if (NON_CONTENT_TAGS.has(name)) suppressDepth += 1;
      if (suppressDepth > 0) return;
      if (name === "head") headDepth += 1;
      else if (name === "title") titleDepth += 1;
      else if (name === "img") imageCount += 1;
      else if (
        name === "meta" &&
        attribs["name"]?.toLowerCase() === "description"
      ) {
        metaDescription ??= collapse(attribs["content"] ?? "");
      } else if (HEADING_TAGS.has(name) && !openHeading) {
        openHeading = { level: Number(name.slice(1)), parts: [] };
      }
    },
    ontext(text) {
      if (jsonLdParts) {
        jsonLdParts.push(text);
        return;
      }
      if (suppressDepth > 0) return;
      if (titleDepth > 0) {
        titleParts.push(text);
        return;
      }
      if (headDepth > 0) return;
      bodyParts.push(text);
      openHeading?.parts.push(text);
    },
    onclosetag(name) {
      if (name === "script" && jsonLdParts) {
        try {
          collectSchemaTypes(JSON.parse(jsonLdParts.join("")), schemaTypes);
        } catch {
          // Malformed JSON-LD is common; it just contributes no types.
        }
        jsonLdParts = null;
      }
      if (NON_CONTENT_TAGS.has(name)) {
        suppressDepth = Math.max(0, suppressDepth - 1);
        return;
      }
      if (suppressDepth > 0) return;
      if (name === "head") headDepth = Math.max(0, headDepth - 1);
      else if (name === "title") titleDepth = Math.max(0, titleDepth - 1);
      else if (openHeading && HEADING_TAGS.has(name)) {
        const text = collapse(openHeading.parts.join("")).slice(
          0,
          MAX_HEADING_CHARS,
        );
        if (text) {
          if (openHeading.level === 1) h1 ??= text;
          else if (headings.length < MAX_HEADINGS) {
            headings.push({ level: openHeading.level, text });
          }
        }
        openHeading = null;
      }
    },
  });
  parser.write(html);
  parser.end();

  const bodyText = collapse(bodyParts.join(" "));
  const title = collapse(titleParts.join(""));
  const wordCount = bodyText ? bodyText.split(" ").length : 0;

  // The slices above can retain the whole source string in V8. Detach them
  // before outlines accumulate across pages.
  return structuredClone({
    title: title || null,
    metaDescription: metaDescription || null,
    h1,
    headings,
    wordCount,
    structuredDataTypes: [...schemaTypes],
    imageCount,
    bodyText: bodyText.slice(0, bodyCharBudget),
    bodyTextTruncated: bodyText.length > bodyCharBudget,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Drops inline Markdown markup, keeping link text, and returns escaped text. */
function inlineMarkdownToHtml(text: string): string {
  const images = (text.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).map(() => "<img>");
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]{1,3}/g, "");
  return escapeHtml(plain) + images.join("");
}

const HTML_MARKUP = /<\/?(html|body|h[1-6]|p|div|article|section|ul|ol|li)\b/i;

/**
 * Turns a draft into HTML the extractor understands. HTML passes through;
 * Markdown headings become `<h1>`-`<h6>`; anything else becomes paragraphs
 * split on blank lines. Plain text has no headings to find.
 */
export function draftToHtml(draft: string): string {
  if (HTML_MARKUP.test(draft)) return draft;

  const blocks: string[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${inlineMarkdownToHtml(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  for (const line of draft.split(/\r?\n/)) {
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    const listItem = /^\s*(?:[-*+]|\d+\.)\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
    } else if (listItem) {
      flushParagraph();
      blocks.push(`<li>${inlineMarkdownToHtml(listItem[1])}</li>`);
    } else if (line.trim() === "") {
      flushParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return blocks.join("\n");
}
