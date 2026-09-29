import { describe, expect, it } from "vitest";
import { draftToHtml, extractPageOutline } from "./extractPageOutline";

describe("draft outlines", () => {
  it("recognises Markdown headings and counts words", () => {
    const draft =
      "# Buying a rental\n\nStart with your **budget**.\n\n## Costs\n\n- Rates\n- Insurance\n\n### Legal\n\nSee [the guide](https://example.com).";
    const outline = extractPageOutline(draftToHtml(draft));

    expect(outline.h1).toBe("Buying a rental");
    expect(outline.headings).toEqual([
      { level: 2, text: "Costs" },
      { level: 3, text: "Legal" },
    ]);
    expect(outline.wordCount).toBe(14);
  });

  it("treats plain text as paragraphs with no headings", () => {
    const outline = extractPageOutline(
      draftToHtml("One line.\n\nAnother line."),
    );

    expect(outline.headings).toEqual([]);
    expect(outline.wordCount).toBe(4);
  });

  it("reads competitor HTML and ignores nav and scripts", () => {
    const html = `<html><head><title>T</title><meta name="description" content="D"></head><body><nav>Menu Menu</nav><h1>Hi</h1><h2>Sub</h2><p>Body words here</p><script type="application/ld+json">{"@type":"FAQPage"}</script></body></html>`;
    const outline = extractPageOutline(html);

    expect(outline).toMatchObject({
      title: "T",
      metaDescription: "D",
      h1: "Hi",
      structuredDataTypes: ["FAQPage"],
      wordCount: 5,
    });
  });
});
