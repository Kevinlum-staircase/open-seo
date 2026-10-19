---
name: gap-plan
description: "Work out where we stand against competitors on every keyword we track, why they are ahead, and the prioritised actions that close the gap."
---

# OpenSEO Gap Plan

## Goal

Answer one question for the keywords the project tracks: "Where do we stand against competitors, why are they ahead, and what exactly do we do about it?" Every tracked keyword ends up in exactly one bucket, and the plan leads with the three to five actions most likely to move traffic this month.

The evidence comes from OpenSEO tools. You do the judging, apply the bucket rules below exactly, and deliver one saved report.

The reader is a non-technical marketing lead. Write in plain English with New Zealand spelling (organisation, optimise, prioritise), and explain each search term the first time it appears (for example, "referring domains: other websites that link to a site").

## Required inputs

- `projectId`
- Nothing else. Target keywords come from Rank Tracking and competitors from project context, so there is one list of each to maintain.

## OpenSEO MCP tools

All free unless marked.

- `get_project_context`: brand, audience, saved competitors, key pages, writing preferences and the research log.
- `get_rank_tracker`: without `trackerId` it lists trackers; with it, each keyword's latest `position`, `previousPosition` and `rankingUrl` per device, plus the tracker's location, devices and `serpDepth`.
- `list_site_audits`, `get_audit_pages`, `get_audit_issues`: the latest Site Audit, used to attach technical issues to our ranking pages.
- `get_search_console_performance`: clicks, impressions and positions by query and page. First-party data, used to prioritise and to spot the wrong page or two pages competing.
- `get_draft_benchmark` (costs credits: one search request plus one small backlinks request per call): the live top 10 for a keyword, outlines of the top pages, referring domains and People Also Ask. For the Gap Plan always pass `detail: "summary"`, which leaves out page body text so 30 keywords fit in one run. Pass `ownUrl` set to our ranking URL when we have one; pass neither `ownUrl` nor `draft` when we have no ranking page.
- `get_keyword_metrics` (costs credits, one request for the whole list): optional, monthly search volume for "page needed" keywords.
- `list_reports` and `save_report`: through the `seo-report` skill.

## Workflow

### 1. Check the setup

1. Call `get_project_context`. Note the saved competitors and key pages. If the research log shows a Gap Plan in the last 14 days and the rank tracker has not run since, offer that report instead of re-running.
2. Call `get_rank_tracker` to list trackers, then again with the tracker for the project's domain. Stop and explain what to fix if:
   - there is no tracker, or it has no keywords (suggest setting one up with 20 to 30 keywords);
   - the tracker's location is not the project's market (for Staircase, New Zealand; the app defaults to the United States);
   - the latest run failed or is older than 14 days (offer `run_rank_tracker`, which costs credits, and say so).
3. Use mobile positions when the tracker checks mobile, otherwise desktop. If the two differ by more than 5 places for a keyword, mention it in that keyword's row.
4. If more than 30 keywords are tracked, take the 30 with the most Search Console impressions and say which were left out.
5. If no competitors are saved, the plan still runs against whoever ranks; say the competitor summary is limited and suggest saving three to five.

### 2. Gather the free data

1. **Site Audit.** Call `list_site_audits`. If the newest completed audit is under 30 days old, read its issues with `get_audit_issues` and keep only those on our ranking URLs. If there is none, or it is older, say so and skip technical findings. Never start a crawl from this skill.
2. **Search Console.** Call `get_search_console_performance` for the last 3 months with dimensions `["query", "page"]` and `minImpressions: 10`. For each tracked keyword, note our clicks and impressions, which of our pages Google shows, and whether two or more of our pages get impressions for it. Google only returns the top 1,000 rows, so for any tracked keyword missing from them, make one more call with a `query` filter equal to that keyword.

### 3. Confirm the spend

Count the keywords that need a benchmark: every keyword except those in the Holding bucket (positions 1 to 3 that have not dropped). Tell the user the count, that each one is one paid search request plus one small backlinks request, and ask to go ahead. Do not make a paid call before they say yes.

### 4. Benchmark each keyword

For each keyword that needs one, call `get_draft_benchmark` once with `detail: "summary"` and:

- `ownUrl` set to our ranking URL from the rank tracker, if we rank within the tracked depth;
- no `ownUrl` and no `draft` if we do not rank.

Then, for that keyword:

1. **Group the ranking sites** as in the Draft Stress Test: institutional (banks, lenders, government, big media, Wikipedia) or realistic rivals (advisers, brokers, property companies and publishers of similar size). If unsure, treat it as a realistic rival and say so.
2. **Rate the six areas** for our page against the realistic rivals in the top 5, each exactly "ahead", "on par" or "behind", with one line of evidence: search intent, topic coverage, depth and usefulness, unique value, trust signals, on-page basics. Skip this for keywords where we have no page.
3. **Authority ratio**: our whole-site referring domains (`winCheck.ourSiteReferringDomains`) divided by the median whole-site figure of the realistic rivals in the top 5. If either number is missing or the median is zero, the ratio is "unknown". Never use page-level referring domains for this; they are often incomplete.
4. **Assign the bucket** with the rules below.

If a call fails or our page cannot be read, say so in that keyword's row, assign the bucket from position alone where the rules allow it, and carry on with the rest.

### 5. Bucket rules

Apply in order. The first rule that matches wins. You judge intent and the six areas; these rules decide the bucket, so the same evidence always gives the same bucket.

| Order | Bucket | Rule |
|---|---|---|
| 1 | Page needed | The rank tracker shows no ranking URL of ours within its depth. |
| 2 | Holding | Our position is 1 to 3 and has not dropped 2 or more places since the previous check. Not benchmarked. |
| 3 | Wrong page ranking | Intent is "behind" for our ranking page, or Search Console shows a different page of ours earning most of the impressions for the keyword. |
| 4 | Authority-limited | Content is competitive and either the authority ratio is below 0.25, or 6 or more of the top 10 results are institutional. |
| 5 | Quick win | Our position is 4 to 20. |
| 6 | Major rework | Everything else: the right page, ranking 21 or lower. |

- **Content is competitive** when no more than one of the six areas is "behind", and that one is not search intent.
- A Holding keyword that dropped 2 or more places is benchmarked like any other and bucketed by rules 3 to 6, with "slipping from the top 3" in its row.
- For Page needed keywords, if Search Console shows a page of ours with impressions for the keyword, name it as a possible existing page to improve rather than writing a new one.

These thresholds (positions 1 to 3, the 2-place drop, 20 as the quick-win cut-off, 0.25 as the authority ratio, 6 of 10 institutional, one area allowed behind, 30 keywords) are starting points. Do not change them within a run.

### 6. Competitor summary

Using the top 10 results from each benchmark, for each saved competitor count:

- the tracked keywords where they rank above us;
- the ones where they rank in the top 10 and we do not;
- their pages that appear most often, since those are the pages worth studying.

Name any site that is not saved but beats us on three or more keywords, and suggest saving it.

### 7. Prioritise

Pick the three to five actions most likely to move traffic this month:

1. Quick wins first, ordered by Search Console impressions (most first), then by how close the position is to the top 3. Their changes come from the areas rated "behind" and the audit issues on that page.
2. Wrong page ranking next, because fixing which page owns a keyword is usually fast.
3. Then Page needed and Major rework, ordered by search volume if you fetched it, otherwise by impressions.
4. Authority-limited keywords go in the plan with a plain note that content changes alone are unlikely to move them, and that they need links from other sites.

Do not pad the list. If only two actions are worth doing this month, list two.

## Deliver as a report

Deliver through the `seo-report` skill, saving with `skill: "gap-plan"`. If that skill is not available, say so and stop before writing HTML. Title: `Gap Plan — <MMM D, YYYY>`, following the `seo-report` title rules.

Report sections, in this order:

1. **Verdict.** A bullet list, one fact per line: how many keywords in each bucket, and the single biggest opportunity.
2. **This month's actions.** The three to five actions, each as Problem, Change and Expected effect in the `seo-report` style, naming the keyword and page.
3. **Every keyword.** One table: keyword, position (and change since the previous check), bucket, our page, one-line reason. Group the rows by bucket in the bucket order above.
4. **By bucket.** For each non-empty bucket, a short section: what the bucket means in one sentence, then the keywords in it with their key evidence. For Page needed and Major rework, list what the page must cover (the rivals' common headings and the People Also Ask questions) and offer the Draft Stress Test once a draft exists.
5. **Competitors.** The competitor summary as a table, plus any unsaved site to consider saving.
6. **Technical issues on ranking pages.** Audit issues on our ranking URLs only, with the audit date. Omit if there was no recent audit, and say why.
7. **Data gaps.** Pages that could not be read, failed calls, unknown authority ratios, mobile and desktop disagreements, and keywords left out by the 30-keyword cap.
8. **What to do next.** The ordered steps.
9. **How this report was made.** Open with one plain sentence naming the "Staircase Gap Plan skill", the agent that ran it and the date, with no link (this is a custom skill with no docs page, so do not use the linked line from `seo-report`). Then which tools reported what and their dates, and what you judged yourself (the site grouping and the six ratings).

## After the report

- Chat reply: at most three short bullets (the verdict, the top action and its expected effect, anything the user must do), then `Read the full report: <url>` on its own line.
- Append a research log entry: `{ appendResearchLog: { summary: "Gap plan: <N> keywords. Verdict: <one line>" } }`. Do not write per-keyword weaknesses into project context.
- Offer one follow-up: a Draft Stress Test for the top Page needed or Major rework keyword once there is a draft.

## Guardrails

- The tools gather evidence; you make the judgement. Separate measured numbers from your inferences in the report.
- Apply the bucket rules exactly, in order. Never move a keyword to a bucket because it "feels" right; if the rules give an odd result, say so in Data gaps.
- Call `get_draft_benchmark` at most once per keyword per run.
- Never present page-level referring domains as complete, and never call a page link-free on that basis.
- Do not promise rankings. Say what makes improving more or less likely, and note that banks and government sites carry built-in trust on finance searches.
- Do not give legal or financial advice. Flag lending, tax and insurance pages for a compliance check before changes go live.
- Do not copy competitor wording. Recommend a stronger answer to the same question.
