---
name: draft-stress-test
description: "Stress test an unpublished draft against the pages that rank on Google for a keyword, judge whether it can win, and list the changes to make before it goes live."
---

# OpenSEO Draft Stress Test

## Goal

Tell a writer, before a page is published, whether the draft is good enough to compete for its keyword and what to change first. The evidence comes from `get_draft_benchmark`: the live Google results, the top pages broken into outlines, and the draft broken down the same way. You do the judging.

The reader is usually a non-technical writer working in the Claude app, with a draft dropped in as HTML, Word, PDF or Markdown. Write for them: plain English, New Zealand spelling (organisation, optimise, colour), and a one-line explanation the first time any search term appears (for example, "referring domains: other websites that link to a site").

## Required inputs

- `projectId`
- The draft (dropped-in file or pasted text)
- The target keyword, plus any secondary keywords the page should also rank for
- Optional: the URL the page will live at

## Project context

The project-context tools are free and shared with the app and other agents.

1. Call `get_project_context` first and ground the test in it: brand, audience, positioning, saved competitors and writing preferences. Project writing preferences apply to your own writing and to any rewrite.
2. Before spending credits, check the research log. If this exact keyword was benchmarked in the last 7 days and the draft has not changed, offer the earlier report instead of re-running. A revised draft is always worth a new run.
3. On finish, append a research log entry: `{ appendResearchLog: { summary: "Draft test: <keyword>. Verdict: <conclusion>" } }`. Do not write the draft's weaknesses into project context; they are not durable facts.

## Deliver as a report

Deliver through the `seo-report` skill, saving with `skill: "draft-stress-test"`. If that skill is not available, say so and stop before writing HTML.

## OpenSEO MCP tools

- `get_project_context`: brand, audience, positioning, competitors.
- `get_draft_benchmark`: the evidence. Pass `keyword` and `draft` (HTML, Markdown or plain text; trimmed to 60,000 characters, and the output says so). Pass `ownUrl` instead only for a page that is already live. If both are given, `ownUrl` wins. It costs one search request plus one small backlink request per call, so call it once per page.
- `list_reports` and `save_report`: through `seo-report`.

## Workflow

### 1. Get the inputs straight

- **Keyword missing.** Ask for it. Suggest two or three likely keywords taken from the draft's title, headings and repeated phrases, and let the writer pick or correct. Do not guess and run.
- **Several files dropped in.** Ask one question: are these one page split across files, or separate pages? One page: combine them in reading order into a single draft. Separate pages: run one full test per page, each with its own keyword.
- **Draft format.** Read Word, PDF, Markdown or HTML as text and keep the headings. Remember the format it arrived in, because the rewrite goes back in that format. Strip obvious working notes (for example "[note to self]") before sending, and tell the writer you did.
- **Secondary keywords.** The benchmark runs on one main keyword. Note the others in the report, and check whether the draft's headings cover them.

### 2. Run the benchmark

Call `get_draft_benchmark` with the main keyword and the draft. Use the project's market by default. If `draft.unreadableReason` or `notes` mention a trimmed draft, say so.

### 3. Sort the ranking results into two groups

Using `organicResults` and `competitors`, label each ranking site:

- **Institutional:** banks and lenders, government (.govt.nz), big media outlets, Wikipedia, and similar large organisations whose authority comes from being who they are, not from the article.
- **Realistic rivals:** advisers, brokers, property companies and publishers of a similar size to the project. These are the pages the draft is actually competing with.

Judge each site from its domain and title. If you cannot tell, treat it as a realistic rival and say the call was uncertain.

### 4. Win check

Base authority on the whole-site referring-domain figures (`siteReferringDomains`, and `winCheck` for the median, minimum, maximum and our own site). Page-level figures (`pageReferringDomains`) are often incomplete for deep pages, so mention them only as secondary, and never conclude a page has no links because its page-level number is 0.

- Judge winnability mainly against the realistic rivals: compare our site's whole-site figure with theirs, and the draft's quality with theirs.
- Say plainly when institutions dominate page one, for example "7 of the top 9 results are banks or government sites". Institutions set a ceiling that a draft cannot beat on content alone, so say that, do not hide it in a footnote.
- When institutions dominate, suggest two or three more specific keywords where realistic rivals rank and the page is more likely to win (a narrower question, a specific buyer, a specific region or scenario). Ground each in the People Also Ask questions, the rivals' headings or the draft's own strongest section. Say these are suggestions to test, and offer to run the benchmark on one.
- If `winCheck.available` is false, say "authority data unavailable" with the reason, and give the content verdict without an authority conclusion.
- If some competitor pages could not be read (`unreadableReason` set, or a note says so), say the comparison is partial and which pages are missing.
- If the recommendations are strong but the realistic rivals still have far more referring domains, say plainly that content alone may not be enough.

### 5. Rate the six areas

Rate each area exactly "ahead", "on par" or "behind" the realistic rivals, with one line of concrete evidence (a number, a heading, a missing question). Do not rate without evidence.

1. **Search intent.** Does the draft answer what searchers want, in the format that ranks (guide, calculator, comparison, list)? Look at titles, headings and SERP features.
2. **Topic coverage.** Subtopics the top pages cover that the draft does not, and People Also Ask questions left unanswered.
3. **Depth and usefulness.** Word count and heading count against the readable rivals; where the draft is thinner or vaguer. Longer is not better unless it is more useful.
4. **Unique value.** What the draft offers that no ranking page does (NZ specifics, real numbers, worked examples, tools, first-hand experience) and what it could add.
5. **Trust signals.** See the next section. Weight this area heavily.
6. **On-page basics.** Title, meta description, H1, heading structure and structured data (machine-readable labels that help Google understand the page, such as FAQ markup) against the keyword and the rivals. A draft dropped in as text may not have a title or meta description yet; say so and propose them.

### 6. Trust signals (money and property content)

Staircase content is about money and property. Google holds this kind of page to a higher standard ("Your Money or Your Life"), so weight trust heavily and be specific. Check the draft for:

- Placeholders left in: "Reviewed by: TBC", "[author]", "[date]", "Lorem ipsum", empty sources.
- No named author, or an author with no credentials or relevant experience shown.
- No published or last-reviewed date, or figures (rates, thresholds, deposit rules) with no date or source.
- Claims with no source, especially about lending rules, tax, deposits or returns.
- Anything that reads like personalised financial advice ("you should buy...", "you can afford...") or a guaranteed outcome ("guaranteed returns", "you will make...", "risk-free").
- Missing general-information disclaimer where one is expected.

Recommend that lending, finance and tax content is checked for compliance before it is published, and say who owns that check if project context names one. Do not give legal advice and do not say a draft is compliant; you can only say what you noticed.

### 7. Write up the changes

List changes in priority order, each tied to the area it fixes, with what to do and why it should help. Order by expected effect on the win check and by how quickly a writer can do it. Anything that stops publication (placeholders, advice-like statements) goes first.

## Output format

Chat reply, kept short and scannable:

1. **Verdict.** One or two sentences: can this draft win as it stands, and what stops it.
2. **Win check.** One line: the realistic rivals' whole-site range against our site's figure, and whether institutions dominate page one.
3. **Six ratings.** A list of the six areas, each "ahead", "on par" or "behind" with one line of evidence.
4. **Top 5 changes.** Numbered, in priority order, one line each.
5. **Report link and next step.** The saved report link, then offer to rewrite the draft with the changes applied.

Nothing else in chat. The detail goes in the report.

Saved report (through `seo-report`), `h1`: `Draft test: <keyword> (<date>)`. Sections in this order:

1. **Verdict.** A bullet list, one fact per line.
2. **Win check.** A table of the ranking results with columns for position, site, group (institutional or realistic rival), whole-site referring domains and page-level referring domains (marked "may be incomplete"), with our site as the last row. State clearly if the comparison is partial. When institutions dominate, include the two or three suggested keywords.
3. **The six areas.** One finding per area: the rating, then Problem, Change and Expected effect in the `seo-report` recommendation style.
4. **Trust and compliance.** Every placeholder, missing credential, missing date, unsourced figure and advice-like or guaranteed-outcome statement, quoted from the draft, plus the compliance recommendation.
5. **Questions to answer.** The People Also Ask questions, marked answered or not answered by the draft.
6. **What to do next.** All the changes in priority order.
7. **How this report was made.** Opens with the skill link line from `seo-report`, pointing at `https://openseo.so/docs/skills/draft-stress-test` ("OpenSEO Draft Stress Test skill"), then which tools reported what, which pages could not be read, and what you judged yourself (for example the institutional versus rival grouping).

## After the report

Always save the report with `save_report`: `skill: "draft-stress-test"`, title `Draft test: <keyword> (<date>)`, using `list_reports` first as `seo-report` describes. A rerun of a revised draft is a new report with a new date, or a new title if it is the same day, so versions can be compared.

Then offer to rewrite the draft with the changes applied, in the format it arrived in (Word stays Word-style text with headings, HTML stays HTML, Markdown stays Markdown). When rewriting:

- Apply the changes you listed, and keep the writer's voice and any figures they supplied.
- Never invent facts, statistics, quotes, author names or credentials. Where the draft needs one, leave a clearly marked gap such as "[ADD: author name and credentials]" and list the gaps at the end.
- Do not add advice-like or guaranteed-outcome wording.
- Offer to run the test again on the revised draft.

## Guardrails

- The tool gathers evidence; you make the judgement. Separate what the tool measured from what you inferred.
- Never present page-level referring domains as complete, and never call a page link-free on that basis.
- Do not rate an area without evidence, and do not pad the changes list to reach five.
- Do not copy competitor wording. Recommend a stronger angle or a better answer to the same question.
- Do not give legal or financial advice. Flag compliance risk and recommend a proper check.
- Do not promise rankings. Say what makes winning more or less likely.
- Do not run the tool more than once per page unless the writer changes the keyword or supplies a revised draft.
