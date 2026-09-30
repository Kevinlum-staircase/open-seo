import { describe, expect, it, vi } from "vitest";
import { readHtmlWithoutBulk } from "@/server/lib/audit/read-html-without-bulk";

/** A streamed response, one chunk per entry, so tests control where tags split. */
function respond(...chunks: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  const cancel = vi.fn();
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index++]));
        } else {
          controller.close();
        }
      },
      cancel,
    }),
  );
  return { response, cancel };
}

const PAGE =
  "<html><head><STYLE>.a{color:red}</STYLE>" +
  '<script src="/x.js">var a = "<script>";</script>' +
  '<script type="application/ld+json">{"@type":"FAQPage"}</script>' +
  "</head><body><h1>Hi</h1></body></html>";

describe("readHtmlWithoutBulk", () => {
  it("empties style and script contents but keeps ld+json, whatever the tag case", async () => {
    const { body } = await readHtmlWithoutBulk(respond(PAGE).response);
    expect(body).toBe(
      "<html><head><STYLE></STYLE>" +
        '<script src="/x.js"></script>' +
        '<script type="application/ld+json">{"@type":"FAQPage"}</script>' +
        "</head><body><h1>Hi</h1></body></html>",
    );
  });

  it("gives the same result when every tag is split across chunks", async () => {
    const whole = await readHtmlWithoutBulk(respond(PAGE).response);
    const split = await readHtmlWithoutBulk(
      respond(...PAGE.split("")).response,
    );
    expect(split).toEqual(whole);
  });

  it("drops everything after an unclosed style, as a browser does", async () => {
    const { body } = await readHtmlWithoutBulk(
      respond("<p>a</p><style>.x{}", "<h1>hidden</h1>").response,
    );
    expect(body).toBe("<p>a</p><style>");
  });

  it("counts only kept characters toward the cap, and stops reading once it is reached", async () => {
    const bulk = "x".repeat(50_000);
    const { response, cancel } = respond(
      `<style>${bulk}</style><p>${"a".repeat(100)}</p>`,
      `<p>${"b".repeat(100)}</p>`,
      "<p>never read</p>",
    );
    const { body } = await readHtmlWithoutBulk(response, { maxKeptChars: 150 });
    // The 50,000 style characters did not use up the 150-character budget.
    expect(body).toHaveLength(150);
    expect(body).toContain("a".repeat(100));
    expect(cancel).toHaveBeenCalled();
  });

  it("cancels a download that passes the raw ceiling even if nothing is kept", async () => {
    const { response, cancel } = respond(
      "<style>" + "x".repeat(100),
      "x".repeat(100),
      "x".repeat(100),
    );
    const { body } = await readHtmlWithoutBulk(response, { maxRawBytes: 150 });
    expect(body).toBe("<style>");
    expect(cancel).toHaveBeenCalled();
  });

  it("returns the start of the page unstripped for bot-challenge checks", async () => {
    const challenge = '<script src="/cdn-cgi/challenge-platform/h/b"></script>';
    const { body, rawSnippet } = await readHtmlWithoutBulk(
      respond(`<script>var c="challenge-platform";</script>${challenge}`)
        .response,
    );
    expect(rawSnippet).toContain('var c="challenge-platform"');
    expect(body).not.toContain('challenge-platform"');
  });
});
