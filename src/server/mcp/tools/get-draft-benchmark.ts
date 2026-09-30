import type { z } from "zod";
import { DraftBenchmarkService } from "@/server/features/draft-test/services/DraftBenchmarkService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  formatMcpTable,
  truncatedCell,
  type McpTableColumn,
} from "@/server/mcp/table";
import { resolveMarket } from "@/shared/keyword-locations";
import {
  draftBenchmarkInputSchema,
  draftBenchmarkOutputSchema,
  type DraftBenchmark,
} from "@/types/schemas/draftBenchmark";

type OrganicResult = DraftBenchmark["organicResults"][number];
type Competitor = DraftBenchmark["competitors"][number];

const inputSchema = {
  projectId: projectIdSchema,
  ...draftBenchmarkInputSchema.shape,
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

const RESULT_COLUMNS: McpTableColumn<OrganicResult>[] = [
  { header: "pos", value: (r) => r.position },
  { header: "domain", value: (r) => r.domain },
  { header: "title", value: (r) => r.title, format: truncatedCell(70) },
  { header: "site ref domains", value: (r) => r.siteReferringDomains },
  {
    header: "page ref domains (may be incomplete)",
    value: (r) => r.pageReferringDomains,
  },
  { header: "ours", value: (r) => r.isOurs },
];

const COMPETITOR_COLUMNS: McpTableColumn<Competitor>[] = [
  { header: "pos", value: (c) => c.position },
  { header: "domain", value: (c) => c.domain },
  { header: "site ref domains", value: (c) => c.siteReferringDomains },
  {
    header: "page ref domains (may be incomplete)",
    value: (c) => c.pageReferringDomains,
  },
  { header: "words", value: (c) => c.outline?.wordCount },
  {
    header: "h2/h3",
    value: (c) => c.outline?.headings.length,
  },
  {
    header: "schema",
    value: (c) => c.outline?.structuredDataTypes.join(", "),
  },
  { header: "couldn't read", value: (c) => c.unreadableReason },
];

function buildText(result: DraftBenchmark): string {
  const sections = [
    `Draft benchmark for "${result.keyword}" (location ${result.locationCode}, ${result.languageCode})`,
    result.ourPosition
      ? `Our domain ranks #${result.ourPosition.position ?? "?"}: ${result.ourPosition.url ?? "—"}`
      : "Our domain is not in the top 10.",
    `Top ${result.organicResults.length} organic results:\n${formatMcpTable(result.organicResults, RESULT_COLUMNS)}`,
    `Competitor pages read (${result.competitors.length}, our domain excluded):\n${formatMcpTable(result.competitors, COMPETITOR_COLUMNS)}`,
    result.winCheck.available
      ? `Win check, whole-site referring domains across ${result.winCheck.competitorsWithData} competitor sites: median ${result.winCheck.medianReferringDomains ?? "—"}, min ${result.winCheck.minReferringDomains ?? "—"}, max ${result.winCheck.maxReferringDomains ?? "—"}. Our site: ${result.winCheck.ourSiteReferringDomains ?? "—"}. Page-level (exact URLs, possibly incomplete): median ${result.winCheck.pageLevel.median ?? "—"}, max ${result.winCheck.pageLevel.max ?? "—"}.`
      : `Win check: authority data unavailable (${result.winCheck.unavailableReason ?? "unknown reason"})`,
    `People Also Ask: ${result.peopleAlsoAsk.join(" | ") || "none"}`,
    `SERP features: ${result.serpFeatures.join(", ") || "none"}`,
  ];
  if (result.draft?.outline) {
    const outline = result.draft.outline;
    sections.push(
      `${result.draft.source === "ownUrl" ? "Our page" : "Draft"}: ${outline.wordCount} words, ${outline.headings.length} H2/H3 headings, H1 ${outline.h1 ?? "—"}`,
    );
  }
  if (result.notes.length > 0) {
    sections.push(`Notes:\n${result.notes.map((n) => `- ${n}`).join("\n")}`);
  }
  sections.push(
    "Full outlines (headings, body excerpts, structured data) are in structuredContent.",
  );
  return sections.join("\n\n");
}

export const getDraftBenchmarkTool = {
  name: "get_draft_benchmark",
  config: {
    title: "Get draft benchmark",
    description:
      "Gather the evidence to stress test a draft (or one of our live pages) against the top Google results for a keyword. Fetches the live top 10 organic results in the project's market with whole-site and page-level referring domains (Backlinks API), People Also Ask questions and SERP features; reads the top pages (default 5, max 8) and breaks each into title, meta description, H1, H2/H3 headings, word count, structured data types, image count and a body excerpt; and breaks the draft down the same way. Our own domain is excluded from the competitor list (its position is reported separately). Pages that can't be read are marked with a reason and the rest continue. Pass `draft` (HTML, Markdown or plain text; trimmed to 60,000 characters with a note) or `ownUrl` (an existing page of ours). If both are given, `ownUrl` wins and `draft` is ignored. This tool only gathers evidence: you judge the draft. If the Backlinks API isn't available or fails, everything else still returns and the win check is marked \"authority data unavailable\" with the reason. Whole-site referring domains are the main win-check measure; page-level counts are secondary and may be incomplete. Costs one DataForSEO SERP request plus one small Backlinks bulk referring-domains request per call; page fetching is free. Does not save anything.",
    inputSchema,
    outputSchema: draftBenchmarkOutputSchema.extend(optionalMetaOutputSchema),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await DraftBenchmarkService.getBenchmark({
      billing: context.billing,
      projectDomain: context.project.domain,
      keyword: args.keyword,
      draft: args.draft,
      ownUrl: args.ownUrl,
      competitorCount: args.competitorCount,
      ...resolveMarket(args, context.project),
    });

    return mcpResponse({
      text: buildText(result),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/keywords`,
      ),
      structuredContent: result,
    });
  }),
};
