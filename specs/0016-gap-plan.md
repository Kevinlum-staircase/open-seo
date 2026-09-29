# Gap Plan (how to close the gap to competitors on our target keywords)

## Status

Proposed. Custom feature for the Staircase fork of OpenSEO. Depends on the engine from `specs/0015-draft-stress-test.md` (live page mode).

**Note (revised 0015):** the Draft Stress Test now splits into an evidence service in OpenSEO (`DraftBenchmarkService`, with live page mode via `ownUrl`) and judging done by Claude through a skill. This spec still assumes the old single engine that also did the AI comparison. Revise it before building, most likely so the Gap Plan also runs from Claude using `get_draft_benchmark`.

## What it does

- A new project page, **Gap Plan**, produces one prioritised action plan answering: "For the keywords we care about, where do we stand against competitors, why are they ahead, and what exactly do we do about it?"
- It combines four things OpenSEO already has but keeps on separate pages: our target keywords and current positions (Rank Tracking), our saved competitors (Project Context), the technical health of our pages (Site Audit), and the live Google results for each keyword. Then it adds the new part: a content comparison of our ranking page against the pages beating it.
- Every keyword ends up in exactly one bucket (the exact rules are under "Bucket rules" below), and the plan is ordered by bucket:
  1. **Quick win**: we rank 4 to 20 with a page that matches the search intent, and the gap is content or on-page issues we can fix.
  2. **Page needed**: nothing of ours ranks within the tracked depth. The plan says what the page must cover and links to Draft Test with the keyword pre-filled.
  3. **Wrong page ranking**: Google ranks a page of ours that doesn't match the search intent (for example the homepage for a specific calculator search). The plan recommends which page should own the keyword.
  4. **Authority-limited**: our content is competitive, but our page has far fewer referring domains than the pages ranking above it. The plan says content changes alone are unlikely to move us, and points to link building.
  5. **Major rework**: the right page exists but ranks below 20 and its content is behind. It needs a substantial rewrite, not tweaks. The plan links to Draft Test so the rewrite can be tested before it goes live.
  6. **Holding**: we rank in the top 3. The plan lists only threats (competitors gaining).
- The plan is saved as an OpenSEO Report, like the Draft Test, so it can be printed or shared with the team.

## What each keyword is benchmarked against

There is no single score. Each keyword is judged against the live Google results for that keyword in the project's market at the time of the run, so the benchmark moves as the results change.

- **Content** (intent, coverage, depth, unique value, trust signals, on-page basics) is compared with the top 5 organic results, excluding our own page. Saved competitors are only part of this comparison if they're in the top 5.
- **Unanswered questions** are checked against the keyword's "People Also Ask" results.
- **Authority** compares our page's referring domains with the median of the top 5.
- **Position** compares our rank with each saved competitor's rank.
- **Technical health** uses Site Audit's fixed rules, which don't depend on competitors.

## Inputs (set up once, reused every run)

- **Target keywords**: the keywords already added to Rank Tracking for the project. The Gap Plan does not keep its own keyword list, so there is one list to maintain.
- **Competitors**: the competitors saved in Project Context.
- **Market and depth**: the project's market, and Rank Tracking's configured depth (how many results it checks). Rank Tracking's location must be set to New Zealand.
- **Latest Site Audit**: optional. If one exists, the plan attaches each page's audit issues to its keywords. If none exists, the plan says so and skips technical findings rather than starting a crawl.

## How it works

The run is long (several keywords, each with a live results lookup, page fetches and an AI call), so it runs as a background Cloudflare Workflow, `GapPlanWorkflow`, following the pattern of `SiteAuditWorkflow` and `RankCheckWorkflow`. The page starts a run, shows progress, and displays the result when the run finishes.

**Step 1: gather.** Load the target keywords, the Rank Tracking config (market and depth), the latest rank snapshot for each keyword, the saved competitors and the latest audit's pages and issues.

**Step 2: per keyword** (one durable workflow step each, so a failure on one keyword doesn't lose the others):

- **Get the live results in one lookup, stopping at our domain.** Call `fetchLiveSerp` with a new optional `stopAtDomain` set to our domain, and the maximum depth set to Rank Tracking's configured depth. This uses the existing `stopCrawlOnTarget` option that rank checks already use: DataForSEO fetches results 10 at a time and stops once our domain appears, so if we rank 14th we pay for two pages of results, not ten. The first page (which holds the top 5) is always included. The same lookup gives our position, our ranking URL, our page's referring domains, every competitor's position within the fetched results, and the People Also Ask questions.
- **Where lookups and Rank Tracking disagree**, the live lookup wins, and the plan notes the difference.
- **Candidate page**: our organic result from the lookup, if there is one.
- **Content comparison**: if there is a candidate page, run the Draft Test engine in live page mode, passing in the results from this lookup so the keyword isn't looked up (and paid for) twice.
- **Audit issues**: attach the candidate page's Site Audit issues, if an audit exists.
- **Authority ratio**: computed in code, as described under "Bucket rules".
- **Bucket**: assigned in code by the rules below.

**Step 3: competitor summary.** For each saved competitor, count how many of our target keywords they beat us on and list the ones where they rank and we don't at all. Report which competitor pages win most often, since those are the pages to study. Positions come from the step 2 lookups, so a competitor ranking below the point where the lookup stopped counts as "below us".

**Step 4: write the plan.** One final AI call turns the per-keyword results into a short executive summary: the three to five actions most likely to move traffic this month, in plain English. Then build the report HTML and save it with `ReportService.saveReport` (`skill: "gap-plan"`, title `Gap plan: <project> (<date>)`).

## Bucket rules

The rules are applied in order, and the first match wins. The AI judges content and intent; code applies the rules, so a keyword's bucket is predictable and explainable run over run.

| Order | Bucket | Rule |
|---|---|---|
| 1 | Page needed | We have no organic result within the tracked depth. |
| 2 | Holding | Our position is 1 to 3. |
| 3 | Wrong page ranking | The engine's intent verdict for our page is "behind". |
| 4 | Authority-limited | Content is competitive (definition below) and the authority ratio is below 0.25. |
| 5 | Quick win | Our position is 4 to 20. |
| 6 | Major rework | Everything else: the right page, ranking 21 or lower. |

Definitions:

- **Content is competitive** when the engine rates no more than one of its six areas as "behind", and that one area is not intent.
- **Authority ratio** is our page's referring domains divided by the median referring domains of the top 5 organic results (excluding our own page). A ratio of 0.25 means we have a quarter of the typical backlinking domains.
- **Missing data**: if our page's referring domains aren't reported, or the top-5 median is zero, the ratio is "unknown". Rule 4 is skipped for that keyword and the plan says the authority check couldn't be run.
- **Like with like**: during the build, confirm whether the SERP data reports referring domains for the ranking page or for its whole site, and compare the same level on both sides. Label the report accordingly.

All thresholds (the 1–3 holding range, the 20 quick-win cut-off, the 0.25 authority ratio, the one-area allowance, top 5 as the benchmark set, the 30-keyword cap) live as named constants in one file, `gapPlanThresholds.ts`, with a comment explaining each. They are starting points, meant to be tuned after the first few runs on real data.

## Where the code goes

New files:

- `src/routes/_project/p/$projectId/gap-plan.tsx`: the page route.
- `src/client/features/gap-plan/`: start button, progress, results and bucket views.
- `src/serverFunctions/gapPlan.ts`: start a run and poll its status.
- `src/server/features/gap-plan/services/GapPlanService.ts`: steps 1, 3 and 4.
- `src/server/features/gap-plan/services/gapPlanBuckets.ts`: the bucket rules and authority ratio, as small pure functions.
- `src/server/features/gap-plan/gapPlanThresholds.ts`: all thresholds in one place.
- `src/server/features/gap-plan/services/gapPlanReportHtml.ts`: report layout.
- `src/server/workflows/GapPlanWorkflow.ts`: the background run.
- `src/types/schemas/gapPlan.ts`: Zod schemas.

Small changes to existing files:

- `src/server/lib/dataforseo/serp.ts`: an optional `stopAtDomain` on `fetchLiveSerp`, reusing the existing `stopCrawlOnTarget`. Existing callers are unaffected.
- `src/client/navigation/items.ts`: one sidebar entry.
- Workflow registration in `wrangler.jsonc` and the self-host deployment config, following how `RankCheckWorkflow` is registered.

Run status needs somewhere to live while the workflow runs. Store it in the existing KV progress mechanism used by the audit (`progress-kv.ts`) rather than adding a database table. The finished result is the saved report.

## Tests

The bucket rules are the one place a quiet mistake would mislead the whole plan, so `gapPlanBuckets.ts` gets one test per rule, plus one for "unknown" authority data. Nothing else in this feature needs new tests.

## Limits and known gaps

- Cost scales with the number of keywords: each keyword is one SERP lookup and one AI call per run. Keywords we rank high for are cheapest. Keywords we don't rank for at all are the most expensive, because the lookup runs to the full tracked depth. Cap a run at 30 keywords. The page shows the keyword count before starting so there are no surprises.
- Only pages that rank within the tracked depth are treated as candidates. A page we wrote for a keyword that Google ignores entirely shows as "page needed", and the plan notes a possible existing page if its title closely matches.
- Competitor pages that block bots or rely on JavaScript are compared partially, as in the Draft Test.
- Competitors ranking below where the lookup stopped show as "below us", without an exact position.
- Beating the top 5 on paper is a strong indicator, not a ranking guarantee. Google also weighs signals the tool can't see well, such as brand searches and how visitors behave after clicking. This matters most for finance topics, where large banks and government sites carry built-in trust.

## Build phases

1. **Core**: the workflow, steps 1 and 2, bucket rules with their tests, and a simple results table. No report, no competitor summary.
2. **Plan**: competitor summary, executive summary and saved report.
3. **Later (optional)**: keyword discovery (keywords competitors rank for that aren't on our list, using the existing ranked-keywords data), run-over-run comparison ("what changed since last month"), a monthly schedule, and an MCP tool so the Claude Code content pipeline can pick up "page needed" and "major rework" items automatically.

## Alternatives considered

- **Its own keyword list**: two lists to keep in sync with Rank Tracking. Rank Tracking already owns target keywords and their history.
- **Crawl the site as part of the run**: the audit is already a robust, separate workflow. Reusing its latest result keeps runs fast and costs predictable.
- **Let the AI assign buckets**: less predictable, harder to trust run over run. The AI judges content and intent; code applies the rules.
- **A separate backlinks lookup for our page**: an extra charge per keyword for a number the results lookup already returns.
- **Always fetching 100 results**: ten times the cost on keywords we rank well for, for positions the plan doesn't need.
- **A single numeric score**: false precision. Per-area verdicts with clear rules are more honest and easier to act on.
- **A full keyword gap table like Semrush's**: upstream explicitly chose not to build one. The discovery phase covers the useful part without the bloat.
