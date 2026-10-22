# Audit Search Check (audit findings weighted by real Google demand)

## Status

Proposed, October 2026. Custom feature for the Staircase fork of OpenSEO.

## Why

The first full audit of staircase.co.nz (Oct 2, 2026) flagged 1,144 issues, but missed the two that mattered most. Both were only found by hand, using Search Console:

- **A noindexed page that still ranks.** `/home-equity` was set to noindex. The audit listed it as an "info" item next to 151 other deliberately hidden pages. It was also the tracked ranking URL for two keywords and had slipped from 12 to 41.
- **A wrongly canonicalised page the crawl never reached.** `/insights/who-pays-water-rates-tenant-or-landlord-nz` earned 350 clicks in 3 months, but its canonical pointed at an unrelated URL made from an email address. Nothing on the site links to it, so the crawler never visited it.

The audit judges every page the same way. It has no idea which pages Google actually shows people, or which pages we track rankings for.

## What it does

A new, free MCP tool, `get_audit_search_checks`, cross-checks the latest Site Audit against Search Console and Rank Tracking for a project. It returns a short list of findings, ranked by how much search demand is at stake:

| Finding                                  | Severity | Rule                                                                                                                                                                                                 |
| ---------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noindex-page-with-search-demand`        | critical | A crawled page is not indexable (robots meta or X-Robots-Tag noindex) and either earned at least the impression threshold in Search Console or is a tracked ranking URL.                             |
| `broken-page-with-search-demand`         | critical | A crawled page returned 4xx or 5xx and has search demand as above.                                                                                                                                   |
| `canonical-elsewhere-with-search-demand` | warning  | A crawled page's canonical points to a different URL, but Google still shows this URL to searchers. Usually means Google is ignoring the canonical, or a duplicate should be a 301 redirect instead. |
| `redirect-with-search-demand`            | info     | A crawled page redirects, but Search Console still reports impressions for the old URL. Normal for a few weeks after a change; worth checking if it persists.                                        |
| `search-page-not-crawled`                | warning  | A page with search demand that the audit did not crawl (not linked, not in the sitemap, or past the page cap). The top ones get URL Inspection (below).                                              |
| `inspected-canonical-elsewhere`          | critical | URL Inspection shows an uncrawled, in-demand page declares a canonical (`userCanonical`) different from itself.                                                                                      |
| `inspected-not-indexable`                | critical | URL Inspection shows an uncrawled, in-demand page is blocked from indexing (noindex, robots.txt or a fetch failure).                                                                                 |

"Search demand" means: the page earned at least `minImpressions` impressions in the chosen Search Console window, or the latest rank check reports it as a ranking URL on either device.

Each finding carries its evidence (impressions, clicks, average position, tracked keywords and their positions, what the audit or URL Inspection saw) and a plain-English "how to fix" line, matching the existing audit issues.

## How it works

Runs in the **app worker**, at read time. It does not run inside the site audit workflow. The audit worker deliberately has no OAuth secrets, because it parses untrusted HTML (see the comment in `alchemy.run.ts`). Search Console needs the user's Google grant, which only the app worker holds.

1. **Load the latest completed audit** for the project (or `auditId` if given), with each page's URL, status code, redirect URL, canonical URL, robots meta, X-Robots-Tag and indexability. This needs a new read-only query, because `AuditRepository.getPagesForAudit` doesn't select the canonical or robots columns. Put it in our own file rather than editing the repository.
2. **Load Search Console page performance** via `GscService.getPerformance` (dimension `page`, default last 3 months, row limit 1,000). If Search Console isn't connected, skip every rule that needs it and say so in `notes`.
3. **Load tracked ranking URLs** from every rank tracker in the project via `RankTrackingService.getConfigs` and `getTracker` (latest `rankingUrl` for desktop and mobile, with the keyword and position).
4. **Match URLs** with the audit's own `normalizeUrl`/`canonicalUrlKey` helpers. Search Console rows that differ from an audit URL only by tracking parameters (`utm_*`, `gclid` and so on) are merged into that page, not reported as separate pages. URLs on a different host from the audit (for example a subdomain) are skipped and listed in `notes`.
5. **Apply the rules** in a pure function (no I/O), so they can be unit tested.
6. **Inspect the top uncrawled pages.** For `search-page-not-crawled` findings, run `GscService.inspectUrls` on the highest-impression ones, up to `maxInspections` (default 20, maximum 50). Then add `inspected-canonical-elsewhere` or `inspected-not-indexable` where they apply. URL Inspection is free but has a quota (about 2,000 per property per day), so the cap matters.
7. **Return** the findings sorted by severity, then by impressions. Also return a summary: counts by finding type, the audit date, the Search Console window, the rank check date, how many URLs were inspected, and notes.

Nothing is stored. Each call recomputes from current data, so a fix shows up as soon as Search Console and the next rank check reflect it.

## Inputs

- `projectId` (required)
- `auditId` (optional; defaults to the latest completed audit)
- `dateRange` (optional; Search Console window, default `last_3_months`)
- `minImpressions` (optional; default 10)
- `maxInspections` (optional; default 20, max 50, 0 to skip URL Inspection)

## Where the code goes

New files:

- `src/server/features/audit-search-check/searchCheckThresholds.ts`: the defaults above as named constants, with a comment on each.
- `src/server/features/audit-search-check/searchCheckRules.ts`: the pure rule function.
- `src/server/features/audit-search-check/searchCheckRules.test.ts`: tests, one per rule, plus URL matching and tracking-parameter merging.
- `src/server/features/audit-search-check/auditSearchCheckQueries.ts`: the read-only audit pages query with canonical and robots columns.
- `src/server/features/audit-search-check/AuditSearchCheckService.ts`: gathers data, calls the rules, runs URL Inspection.
- `src/types/schemas/auditSearchCheck.ts`: Zod schemas for input and output.
- `src/server/mcp/tools/get-audit-search-checks.ts`: the MCP tool, following `get-draft-benchmark.ts` and the existing audit tools.

Small changes to existing files:

- `src/server/mcp/server.ts`: register the tool (one line, next to the other audit tools).
- `plugins/openseo/skills/gap-plan/SKILL.md` (ours): in "Gather the free data", call `get_audit_search_checks` and attach its findings to the matching keywords' pages.

No database tables, migrations, workflows, environment variables or changes to the audit worker.

## Tool description (for Claude)

The tool description should say: free; uses the latest completed audit plus Search Console and Rank Tracking; returns only issues on pages with real search demand; run it after `get_audit_issues` whenever Search Console is connected; and its critical findings outrank the audit's own issue list.

## Limits

- Search Console data lags about 3 days, and the rank check is weekly, so a just-fixed page can still be flagged for a few days.
- Only the top 1,000 Search Console pages are considered. That's plenty for staircase.co.nz, but a larger site could miss long-tail pages.
- URL Inspection reports Google's last crawl, which can be weeks old. Findings show the last crawl date so a stale result is obvious.
- A page that is noindexed on purpose but still has demand (for example a thank-you page) will be flagged. That's intended: if Google shows it, someone should confirm the noindex is deliberate.

## Build phases

1. **Now**: the service, rules, tests and MCP tool, plus the gap-plan skill step. Test on the Staircase project.
2. **Later (optional)**: show the findings on the app's Site Audit page as a "Search impact" panel; run the check automatically when an audit finishes; include striking-distance pages (positions 5 to 20) whose audit issues are worth fixing first.
