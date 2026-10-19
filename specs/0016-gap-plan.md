# Gap Plan (how to close the gap to competitors on our target keywords)

## Status

Revised October 2026. Custom feature for the Staircase fork of OpenSEO.

This replaces the earlier in-app design (a Gap Plan page backed by a `GapPlanWorkflow` and its own AI calls). That design pre-dated the revised Draft Stress Test (`specs/0015-draft-stress-test.md`), which split into an evidence tool in OpenSEO (`get_draft_benchmark`) and judging done by Claude through a skill. The Gap Plan now follows the same pattern: Claude runs it through the OpenSEO connector, using tools that already exist plus one small option on `get_draft_benchmark`.

## What it does

- Someone asks Claude for a gap plan for the project. Claude, following the **Gap Plan skill** (`plugins/openseo/skills/gap-plan/SKILL.md`), answers: "For the keywords we track, where do we stand against competitors, why are they ahead, and what exactly do we do about it?"
- Every tracked keyword lands in exactly one bucket, in this order: Page needed, Holding, Wrong page ranking, Authority-limited, Quick win, Major rework. The rules are in the skill and are applied in order, first match wins.
- The plan leads with the three to five actions most likely to move traffic this month, and is saved as an OpenSEO report (`skill: "gap-plan"`), like the Draft Stress Test.

## Inputs (set up once in the app, reused every run)

- **Target keywords**: the keywords in Rank Tracking. The Gap Plan keeps no list of its own. Rank Tracking's location must be the project's market (New Zealand for Staircase).
- **Competitors**: the competitors saved in Project Context.
- **Latest Site Audit**: optional. Used if it is under 30 days old; the skill never starts a crawl.
- **Search Console**: optional but recommended. Free first-party data used to prioritise and to spot the wrong page ranking.

## How it works

All in the skill, using existing MCP tools:

1. **Setup check** (free): `get_project_context`, `get_rank_tracker`. Stop with a clear fix if there is no tracker, no keywords, the wrong location, or stale positions.
2. **Free data**: `list_site_audits` and `get_audit_issues` for issues on our ranking URLs; `get_search_console_performance` by query and page for clicks, impressions and competing pages of ours.
3. **Confirm the spend**: Claude tells the user how many paid benchmark calls it will make and waits for a yes.
4. **Per keyword** (paid): one `get_draft_benchmark` call with `detail: "summary"`, passing `ownUrl` set to the rank tracker's ranking URL, or nothing when we do not rank. Holding keywords (positions 1 to 3, not slipping) are not benchmarked. Claude groups the ranking sites into institutional and realistic rivals, rates our page on the Draft Stress Test's six areas, works out the authority ratio, and applies the bucket rules.
5. **Competitor summary**, **prioritisation** and the **report**, through `seo-report`.

### Authority ratio

Our site's whole-site referring domains divided by the median whole-site figure of the realistic rivals in the top 5. This settles the earlier "like with like" question: `get_draft_benchmark` reports whole-site and page-level counts, and the Draft Stress Test found page-level counts too often incomplete to rely on, so both sides use whole-site counts. The ratio is "unknown" when either figure is missing.

## Code changes

Small, and only to our own Draft Stress Test files:

- `src/types/schemas/draftBenchmark.ts`: a new optional input `detail`, `"full"` (default) or `"summary"`.
- `src/server/features/draft-test/services/DraftBenchmarkService.ts`: in summary mode, outline competitor pages and our `ownUrl` page with no body text (`extractPageOutline(html, 0)`). Everything else is unchanged.
- `src/server/mcp/tools/get-draft-benchmark.ts`: pass `detail` through, and mention it in the tool description ("summary leaves out page body text, for runs over many keywords such as the Gap Plan").
- `plugins/openseo/skills/gap-plan/SKILL.md`: the skill.

Why the summary mode: a full benchmark returns up to six body excerpts of about 6,000 characters each. Across 30 keywords that is around a million characters, more than a Claude conversation can hold. Without body text, each call is a small fraction of that, and the headings, word counts and structured data that the Gap Plan judges on are all kept.

No new pages, database tables, workflows, environment variables or AI calls inside OpenSEO. The default for `get_draft_benchmark` stays `"full"`, so the Draft Stress Test is unaffected.

## Tests

- Summary mode returns outlines with an empty `bodyText` for competitors and for an `ownUrl` page, and full mode (the default) is unchanged.
- A call with neither `draft` nor `ownUrl` returns the live results with `draft: null` (already supported; add a test if one does not exist).

The bucket rules live in the skill, not in code, so they have no unit tests. The skill states them as a fixed, ordered table to keep runs consistent.

## Installing

After the change is deployed, each person who runs the Gap Plan installs the skill in Claude the same way as the Draft Stress Test: zip the `gap-plan` folder and upload it in Claude's skill settings. They also need the OpenSEO connector and their email in `ACCESS_ALLOWED_EMAILS`.

## Limits and known gaps

- **Cost**: one search request plus one small backlinks request per benchmarked keyword. A 30-keyword run with five Holding keywords is 25 calls. The skill always confirms before spending.
- **Top 10 only**: `get_draft_benchmark` reads the top 10. For a keyword where we rank 14th, our position and page come from the rank tracker, and competitor positions below 10 are not known.
- **Judging is not byte-for-byte repeatable** because Claude rates the six areas. The fixed areas, ratings and ordered bucket rules keep runs consistent.
- **Unreadable pages**: competitor pages that block bots or rely on JavaScript are compared partially, as in the Draft Stress Test.
- **No ranking guarantee**: beating the top 5 on paper is a strong indicator, not a promise. This matters most on finance searches, where banks and government sites carry built-in trust.

## Build phases

1. **Now**: the `detail` option, its tests, and the skill. Test end to end on the Staircase project.
2. **Later (optional)**: run-over-run comparison ("what changed since last month"), keyword discovery from competitors' ranked keywords, a monthly scheduled run, and moving the bucket rules into code if runs prove inconsistent.

## Alternatives considered

- **The original in-app page and workflow**: far more code (a route, client views, a workflow, progress storage, report layout and in-app AI calls through OpenRouter), and it would duplicate the judging the Draft Stress Test skill already does in Claude.
- **A new bundled MCP tool** gathering everything per keyword: possible later, but the existing tools already return what the skill needs.
- **Its own keyword list**: two lists to keep in sync. Rank Tracking already owns target keywords and their history.
- **Page-level referring domains for the authority ratio**: too often incomplete for deep pages.
- **Benchmarking Holding keywords**: spends credits on keywords we already win. They are only benchmarked when they slip.
