import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftBenchmarkService } from "./DraftBenchmarkService";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  fetchPageHtml: vi.fn(),
}));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
}));

vi.mock("@/server/lib/scrape", () => ({
  fetchPageHtml: mocks.fetchPageHtml,
}));

const PAGE_HTML = `<html><head><title>Page</title></head><body>
  <h1>Heading</h1><h2>Sub heading</h2><p>one two three four five six</p>
</body></html>`;

function benchmark(overrides: { detail: "full" | "summary"; ownUrl?: string }) {
  return DraftBenchmarkService.getBenchmark({
    billing: {
      organizationId: "org_1",
      userEmail: "a@b.com",
      userId: "user_1",
    },
    projectDomain: "ours.com",
    keyword: "test keyword",
    locationCode: 2554,
    languageCode: "en",
    ...overrides,
  });
}

beforeEach(() => {
  mocks.createDataforseoClient.mockReturnValue({
    serp: {
      live: vi.fn().mockResolvedValue([
        {
          type: "organic",
          rank_group: 1,
          domain: "rival.com",
          url: "https://rival.com/page",
          title: "Rival",
        },
      ]),
    },
    backlinks: { bulkReferringDomains: vi.fn().mockResolvedValue([]) },
  });
  mocks.fetchPageHtml.mockResolvedValue(PAGE_HTML);
});

describe("DraftBenchmarkService.getBenchmark", () => {
  it("summary mode leaves out body text but keeps real word counts", async () => {
    const result = await benchmark({
      detail: "summary",
      ownUrl: "https://ours.com/page",
    });

    const outlines = [result.competitors[0].outline, result.draft?.outline];
    expect(outlines).toHaveLength(2);
    for (const outline of outlines) {
      expect(outline?.bodyText).toBe("");
      expect(outline?.wordCount).toBeGreaterThan(0);
      expect(outline?.headings).toHaveLength(1);
    }
  });

  it("full mode keeps body text", async () => {
    const result = await benchmark({
      detail: "full",
      ownUrl: "https://ours.com/page",
    });

    expect(result.competitors[0].outline?.bodyText).toContain("one two three");
    expect(result.draft?.outline?.bodyText).toContain("one two three");
  });

  it("returns the live results with draft null when no page of ours is given", async () => {
    const result = await benchmark({ detail: "full" });

    expect(result.draft).toBeNull();
    expect(result.organicResults).toHaveLength(1);
  });
});
