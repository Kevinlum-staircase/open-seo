# Draft Stress Test (compare an unpublished draft against the live top-ranking pages)

## Status

Proposed (revised). Custom feature for the Staircase fork of OpenSEO. Not intended for upstream.

The first version of this spec put a new page inside OpenSEO and had OpenSEO call an AI model through OpenRouter. This version moves the judging into Claude. OpenSEO only gathers the evidence. See "Alternatives considered" for why.

## What it does

- A writer works in Claude (desktop or web), where drafts are already produced. They drop in a draft (HTML, Word, PDF, Markdown or pasted text), give the target keyword, and ask Claude to stress test it.
- Claude calls one new OpenSEO MCP tool, `get_draft_benchmark`. The tool pulls the live Google results for that keyword in the project's market (New Zealand for Staircase), reads the top-ranking pages, breaks each one down, breaks the draft down the same way, and returns all of it as structured evidence.
- Claude, following the **Draft Stress Test skill**, compares the draft with that evidence and the project's saved context, then returns:
  - a verdict: "ready to publish", "close" or "not competitive yet"
  - a "can we realistically win this?" check, based on how strong the ranking sites are
  - a rating of exactly "ahead", "on par" or "behind" for each of the six areas below
  - a gap list and a prioritised list of changes
- The writer can then ask Claude to apply the changes and hand back the revised draft, and run the test again.
- Each run is saved as a normal OpenSEO **Report** through the existing `save_report` tool, so it appears on the project's Reports page and can be printed or shared.
- Nothing is published and nothing is written to the website.

## User flow

1. One-time setup per person: add the OpenSEO connector in Claude, install the Draft Stress Test skill, and add the person's email to `ACCESS_ALLOWED_EMAILS`.
2. In Claude, drop in the draft and write something like: "Stress test this for 'property investment nz'. It will live at /property-investment-nz."
3. Claude fetches the benchmark, compares, replies with the verdict, the top actions and a link to the saved report.
4. The writer asks for a revised draft, then asks for another test. Each run saves a new report, so versions can be compared.

## How it works

### OpenSEO side: the `get_draft_benchmark` MCP tool

A new tool in `src/server/mcp/tools/`, following the pattern of `get_serp_results` (`withMcpProjectAuth`, `createDataforseoClient(context.billing)`, `resolveMarket`, Zod input and output schemas, `mcpResponse`). It is read-only apart from the metered DataForSEO call.

**Input**

- `projectId`
- `keyword` (required)
- `locationCode` / `languageCode` (optional; default to the project's market)
- `draft` (optional): the draft's content as HTML, Markdown or plain text, up to about 60,000 characters. When given, the tool returns the draft's outline built by the same extractor used on competitor pages, so word counts and heading structure are compared like for like.
- `ownUrl` (optional, "live page mode"): the URL of one of our existing pages. The tool fetches and outlines it in place of `draft`. The Gap Plan (`specs/0016-gap-plan.md`) uses this.
- `competitorCount` (optional, default 5, maximum 8): how many top organic pages to read.

**Steps**

1. **Live results.** One `serp.live` call at depth 10 in the resolved market. Keep the organic items and the `people_also_ask` questions, and note which SERP features appear.
2. **Our position.** If the project's domain appears in the organic results, record its position and URL. Leave our own domain out of the competitor list.
3. **Read the top pages.** Fetch the top `competitorCount` organic URLs through the existing SSRF-safe fetch in `src/server/lib/scrape.ts`, exporting a small `fetchPageHtml(url)` there rather than duplicating the redirect and private-IP protection. A page that fails (blocked, timed out, empty) is marked "couldn't read" and the rest continue.
4. **Break each page down.** A new extractor built on `htmlparser2` (already installed) returns the title, meta description, H1, the H2 and H3 texts in order, word count, structured data types present (FAQ, HowTo, Article and so on), image count, and body text trimmed to a fixed budget per page. The audit's `analyzeHtml` is not reused: it keeps heading levels but not heading text, and changing it risks the audit engine's memory limits.
5. **Break the draft down.** Run the same extractor on `draft` (Plain text and Markdown are first converted to simple HTML so headings are recognised) or on the fetched `ownUrl` page.
6. **Win check, computed in code.** One DataForSEO Backlinks bulk referring-domains request covers three things: each ranking site's whole domain, each ranking page's exact URL, and our own site. The whole-site figure is the main measure, because page-level counts are often missing for deep URLs and would understate the competition. Whole-site lookups use the root domain without `www`, because DataForSEO counts a bare domain together with its subdomains and returns the fuller figure. Page URLs go through as the results list them (full path kept) but with tracking parameters (`utm_*`, `gclid`, `fbclid`, `srsltid` and similar) removed. The win check reports the median, minimum and maximum whole-site referring domains across the competitors, plus our own site's figure. Page-level counts are reported alongside as secondary information, labelled as possibly incomplete. Live SERP results carry no backlink data, which is why this is a separate request. If the Backlinks API isn't available on the account or the call fails, the rest of the output is unaffected and the win check is marked "authority data unavailable" with the reason.

**Output**

The keyword and market used, the top 10 organic results (position, domain, URL, title, referring domains, backlinks), the People Also Ask questions, the SERP features present, our position and URL if we rank, the competitor outlines (or "couldn't read" with a reason), the draft outline, and the win-check numbers. It also returns a short text table in the style of the other tools.

**Cost:** one DataForSEO SERP request plus one small Backlinks bulk referring-domains request per call (which needs Backlinks API access on the account). Page fetching is free.

### Claude side: the Draft Stress Test skill

A skill file, `plugins/openseo/skills/draft-stress-test/SKILL.md`, written in the same format as the existing skills in that folder. It is installed into Claude for each person who uses the checker. It tells Claude to:

1. Call `get_project_context` for the brand, audience, positioning and competitors.
2. Read the dropped-in draft. If several files are dropped in, confirm whether they are one page or separate pages; run one test per page.
3. Call `get_draft_benchmark` with the keyword and the draft's content.
4. Judge each of the six areas, rating each exactly "ahead", "on par" or "behind" with concrete evidence:
   - **Search intent**: does the draft answer what searchers want, in the format that ranks (guide, calculator, comparison, list)?
   - **Topic coverage**: subtopics the top pages cover that the draft doesn't, and People Also Ask questions left unanswered.
   - **Depth and usefulness**: where the draft is thinner or vaguer than the competition.
   - **Unique value**: what the draft offers that no ranking page does (NZ specifics, real numbers, tools, first-hand experience), and what it could add.
   - **Trust signals**: author expertise, sources, dates, disclaimers. Finance and property are "Your Money or Your Life" topics, so this area is weighted heavily.
   - **On-page basics**: title, meta description, H1 and heading structure against the keyword.
5. Give the overall verdict and the win check. If the recommendations are strong but the ranking sites have far more referring domains, say plainly that content alone may not be enough.
6. List changes in priority order, each tied to the area it fixes.
7. Save a self-contained HTML report with `save_report` (`skill: "draft-stress-test"`, title `Draft test: <keyword> (<date>)`), then reply with the verdict, the top three actions and the report link.
8. Offer to rewrite the draft with the changes applied, in the same format it arrived in.

The verdict is guidance, not a ranking guarantee, and the skill says so in the report.

## Where the code goes

New files:

- `src/server/mcp/tools/get-draft-benchmark.ts`: the tool.
- `src/server/features/draft-test/services/DraftBenchmarkService.ts`: steps 1 to 6, as a service the tool calls, so the Gap Plan can call it directly from a workflow without going through MCP.
- `src/server/features/draft-test/services/extractPageOutline.ts`: the extractor for steps 4 and 5.
- `src/types/schemas/draftBenchmark.ts`: Zod schemas for the input and output.
- `plugins/openseo/skills/draft-stress-test/SKILL.md`: the skill.

Small changes to existing files (kept minimal so upstream updates merge cleanly):

- `src/server/mcp/server.ts` (or wherever tools are registered): register the new tool.
- `src/server/lib/scrape.ts`: export `fetchPageHtml`.

No database changes, no new pages or routes, no new environment variables, and no OpenRouter usage.

## Access

Claude connects to `https://<worker-hostname>/mcp`. On the Cloudflare self-host, Managed OAuth must be turned on for the Access application, with Claude's redirect URIs allowed (see `docs/SELF_HOSTING_CLOUDFLARE_OPERATIONS.md`). Each user must be in `ACCESS_ALLOWED_EMAILS`.

## Limits and known gaps

- Pages that build their content with JavaScript, or that block bots, may be unreadable or return little text. The output lists them so the comparison is known to be partial.
- The draft is limited to about 60,000 characters, and competitor text to a fixed budget per page, so the tool's response stays a manageable size for Claude.
- If a call runs longer than the MCP request time limit, the page fetches move into a background Cloudflare Workflow, like `SiteAuditWorkflow`, with a second tool to collect the result.
- Judging happens in Claude, so runs are not byte-for-byte repeatable. The skill's fixed areas, ratings and output format keep them consistent.

## Build phases

1. **Working core**: the service, extractor and MCP tool, tested locally from Claude Code against three real Staircase drafts.
2. **Skill and connection**: the Draft Stress Test skill, Managed OAuth, the connector in Claude, report saving. Test end to end with a writer's real drafts.
3. **Later (optional)**: compare against our own domain's referring domains, and a side-by-side diff of two runs.

## Alternatives considered

- **A Draft Test page in OpenSEO with an OpenRouter AI call** (the first version of this spec): more code (route, form, results screen, AI plumbing, report HTML), a weaker default model, and writers would have to leave Claude, where the drafts are made, to use it. Feedback would also be a dead end: a rewrite would need another tool.
- **No new tool: let Claude use `get_serp_results` and its own web fetch**: `get_serp_results` drops People Also Ask and referring domains, and Claude's web fetch is blocked by more sites and returns inconsistent page breakdowns. One purpose-built tool gives the same evidence on every run.
- **Reuse the cached keyword SERP analysis**: it keeps organic results only and drops People Also Ask.
- **A new database table for test runs**: the reports feature already stores, lists and shares results.
- **A single numeric score out of 100**: false precision. Per-area ratings with concrete fixes are more honest and more actionable.
