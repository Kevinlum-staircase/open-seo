# Search impact panel (audit search check findings on the Site Audit page)

## Status

Proposed, November 2026. Custom feature for the Staircase fork of OpenSEO.

## Why

`get_audit_search_checks` finds the audit problems that actually cost search traffic (a noindexed page that still ranks, a canonical pointing elsewhere on a page Google shows, high-impression pages the crawl never reached). Today only Claude can see it. People who open the Site Audit page see the audit's own issue list, which weighs every page the same: on staircase.co.nz, `/home-equity` sat among 151 harmless noindex notices.

The panel puts the search check on the audit page itself, so anyone on the team sees the few problems that matter without Claude, skills or credits.

## What it shows

A **Search impact** panel at the top of an audit's results, above the Issues / Pages / Performance tabs, for the audit being viewed:

1. **Header**: "Search impact" with counts (for example "4 critical, 18 warnings"), the Search Console window, and the rank check date. One line saying what it is: "Problems on pages Google shows or we track, from Search Console and Rank Tracking."
2. **Critical findings**, always visible: one row each with the page (link), what's wrong in plain English (the finding's `evidence`), impressions, clicks, tracked keywords with positions, and an expandable "How to fix" (the finding's `howToFix`).
3. **Warnings**, collapsed by default ("Show 18 warnings").
4. **Not crawled**: the top uncrawled pages and the folder summary (`notCrawledByFolder`), collapsed by default, with one line explaining why it matters ("Pages Google shows that this audit never reached: not linked, not in the sitemap, or past the page limit").
5. **Hidden on purpose**: one muted line when sections are ignored, for example "Ignoring /property-investment-glossary-list/ (noindexed on purpose). Edit in Context." linking to the project's Context page.
6. **Status messages instead of errors**:
   - Search Console not connected or expired: show the Rank Tracking findings, plus "Connect Search Console for the full check" with a link to the existing Search Console settings.
   - Nothing found: "No search-impact problems on pages with search demand."
   - The panel fails to load: a small inline message; the rest of the audit page works as normal.

The panel loads on its own after the page (a loading placeholder, not a blank wait), so it never slows the audit results.

## URL Inspection

The panel does not run URL Inspection on page load (`maxInspections: 0`): it uses Google's daily quota and takes time. A **"Check top uncrawled pages with Google"** button runs it on demand (`maxInspections: 10`) and refreshes the panel, so the inspected findings (`inspected-canonical-elsewhere`, `inspected-not-indexable`) appear.

## Sections hidden on purpose (one source of truth)

The ignore list lives in Project Context, so Claude, the Gap Plan and the panel all use the same one:

- Custom section slug `deliberately-noindexed`. Every line starting with `- /` declares one path prefix: the first token after `- ` up to whitespace (for example `- /property-investment-glossary-list/ (property term definitions…)` gives `/property-investment-glossary-list/`).
- `AuditSearchCheckService` uses these prefixes as the default `ignorePaths` when the caller passes none. An explicit `ignorePaths` (including an empty list) overrides them.
- The panel shows which prefixes were applied (from `summary.ignoredPaths`) with a link to edit them in Context.

This is a parsing convention on an existing section, not a new setting or table.

## How it works

- A new server function, `getAuditSearchChecks`, in its own file `src/serverFunctions/auditSearchCheck.ts`, using the same `requireProjectContext` middleware as `src/serverFunctions/audit.ts`. Input: `auditId`, optional `maxInspections` (0 or 10 from the panel). It calls `AuditSearchCheckService` with the viewed audit's id. Free: no DataForSEO credits.
- A new component, `src/client/features/audit/results/SearchImpactPanel.tsx`, fetching through that server function with the app's existing data-fetching pattern (follow how `ResultsView` and the audit route load data).
- One small edit to `ResultsView.tsx`: render the panel above the tabs.
- The service change for the default `ignorePaths` (above), with tests.

No new database tables, migrations, workflows, environment variables or AI calls. No change to the audit worker.

## Styling

Match the existing audit page: the same daisyUI components, badges and severity colours `IssuesView` uses, the same table and collapse patterns. Works in light and dark mode and at phone width. No new dependencies.

## Limits

- Search Console data lags about 3 days, and rank checks are weekly.
- The panel reflects the audit being viewed; an old audit shows old crawl data against current Search Console data, so it shows the audit date clearly.
- Only the top 1,000 Search Console pages are considered.

## Build phases

1. **Now**: the panel, the on-demand inspection button, the Context-based ignore list, tests.
2. **Later (optional)**: CSV export of the findings; a "Search impact" count on the dashboard; a badge on matching rows in the Issues tab.
