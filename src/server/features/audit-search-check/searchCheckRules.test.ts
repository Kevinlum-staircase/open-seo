import { describe, expect, it } from "vitest";
import {
  findSearchIssues,
  type SearchCheckAuditPage,
  type SearchConsolePageRow,
  type TrackedRankingUrl,
} from "@/server/features/audit-search-check/searchCheckRules";

const SITE = "https://staircase.co.nz";

function page(
  path: string,
  overrides: Partial<SearchCheckAuditPage> = {},
): SearchCheckAuditPage {
  return {
    url: `${SITE}${path}`,
    statusCode: 200,
    fetchClass: "ok",
    redirectUrl: null,
    canonicalUrl: null,
    robotsMeta: null,
    xRobotsTag: null,
    ...overrides,
  };
}

function gscRow(
  path: string,
  overrides: Partial<SearchConsolePageRow> = {},
): SearchConsolePageRow {
  return {
    url: `${SITE}${path}`,
    clicks: 5,
    impressions: 100,
    position: 8,
    ...overrides,
  };
}

function tracked(path: string): TrackedRankingUrl {
  return {
    url: `${SITE}${path}`,
    keyword: "home equity nz",
    device: "desktop",
    position: 41,
  };
}

function check(input: {
  pages?: SearchCheckAuditPage[];
  gscRows?: SearchConsolePageRow[];
  trackedUrls?: TrackedRankingUrl[];
  inspections?: { url: string; result: object | null }[];
}) {
  return findSearchIssues({
    auditStartUrl: `${SITE}/`,
    pages: [],
    gscRows: [],
    trackedUrls: [],
    inspections: [],
    minImpressions: 10,
    ...input,
  });
}

describe("findSearchIssues", () => {
  it("flags a noindexed page that is only a tracked ranking URL", () => {
    const { findings } = check({
      pages: [page("/home-equity", { robotsMeta: "noindex, follow" })],
      trackedUrls: [tracked("/home-equity")],
    });

    expect(findings).toMatchObject([
      {
        type: "noindex-page-with-search-demand",
        severity: "critical",
        impressions: 0,
        trackedKeywords: [{ keyword: "home equity nz", position: 41 }],
      },
    ]);
  });

  it("ignores a deliberately noindexed page nobody searches for", () => {
    const { findings } = check({
      pages: [page("/thank-you", { xRobotsTag: "noindex" })],
      gscRows: [gscRow("/thank-you", { impressions: 3 })],
    });

    expect(findings).toEqual([]);
  });

  it("flags a broken page with impressions", () => {
    const { findings } = check({
      pages: [page("/old", { statusCode: 404 })],
      gscRows: [gscRow("/old")],
    });

    expect(findings[0]).toMatchObject({
      type: "broken-page-with-search-demand",
      severity: "critical",
    });
  });

  it("flags a canonical that points elsewhere", () => {
    const { findings } = check({
      pages: [page("/a", { canonicalUrl: `${SITE}/b` })],
      gscRows: [gscRow("/a")],
    });

    expect(findings[0]).toMatchObject({
      type: "canonical-elsewhere-with-search-demand",
      severity: "warning",
    });
  });

  it("flags a redirect that still has impressions", () => {
    const { findings } = check({
      pages: [page("/a", { statusCode: 301, redirectUrl: `${SITE}/b` })],
      gscRows: [gscRow("/a")],
    });

    expect(findings[0]).toMatchObject({
      type: "redirect-with-search-demand",
      severity: "info",
    });
  });

  it("flags a page with demand that the audit never crawled", () => {
    const { findings } = check({ gscRows: [gscRow("/hidden")] });

    expect(findings[0]).toMatchObject({
      type: "search-page-not-crawled",
      severity: "warning",
    });
  });

  it("flags an uncrawled page whose inspected canonical is elsewhere", () => {
    const water = "/insights/who-pays-water-rates-tenant-or-landlord-nz";
    const { findings } = check({
      gscRows: [gscRow(water, { clicks: 350, impressions: 9000 })],
      inspections: [
        {
          url: `${SITE}${water}`,
          result: {
            indexStatusResult: {
              userCanonical: `${SITE}/insights/barcenilla-brian9-gmail-com-1`,
              lastCrawlTime: "2026-09-20T01:00:00Z",
            },
          },
        },
      ],
    });

    // Replaces the not-crawled warning for this page.
    expect(findings.map((f) => f.type)).toEqual([
      "inspected-canonical-elsewhere",
    ]);
    expect(findings[0].evidence).toContain("barcenilla-brian9-gmail-com-1");
  });

  it("flags an uncrawled page that URL Inspection says is blocked", () => {
    const { findings } = check({
      gscRows: [gscRow("/hidden")],
      inspections: [
        {
          url: `${SITE}/hidden`,
          result: {
            indexStatusResult: { indexingState: "BLOCKED_BY_META_TAG" },
          },
        },
      ],
    });

    expect(findings.map((f) => f.type)).toEqual(["inspected-not-indexable"]);
  });

  it("keeps the not-crawled warning when inspection finds nothing wrong", () => {
    const { findings } = check({
      gscRows: [gscRow("/hidden")],
      inspections: [
        {
          url: `${SITE}/hidden`,
          result: { indexStatusResult: { indexingState: "INDEXING_ALLOWED" } },
        },
      ],
    });

    expect(findings.map((f) => f.type)).toEqual(["search-page-not-crawled"]);
  });

  it("merges Search Console rows that differ only by tracking parameters", () => {
    const { findings } = check({
      pages: [page("/guide", { robotsMeta: "noindex" })],
      gscRows: [
        gscRow("/guide", { impressions: 6, clicks: 1 }),
        gscRow("/guide?utm_source=newsletter", { impressions: 6, clicks: 2 }),
      ],
    });

    // Neither row reaches 10 impressions alone, so one finding proves they merged.
    expect(findings).toMatchObject([{ impressions: 12, clicks: 3 }]);
  });

  it("skips URLs on another host and says so", () => {
    const { findings, notes } = check({
      gscRows: [
        { ...gscRow("/post"), url: "https://blog.staircase.co.nz/post" },
      ],
    });

    expect(findings).toEqual([]);
    expect(notes[0]).toContain("blog.staircase.co.nz");
  });
});
