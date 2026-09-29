import { z } from "zod";
import { languageCodeSchema, locationCodeSchema } from "@/server/mcp/schemas";

export const MAX_DRAFT_CHARS = 60_000;
export const DEFAULT_COMPETITOR_COUNT = 5;
export const MAX_COMPETITOR_COUNT = 8;

export const draftBenchmarkInputSchema = z.object({
  keyword: z.string().min(1).describe("The target keyword to benchmark."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  draft: z
    .string()
    .max(1_000_000)
    .optional()
    .describe(
      `The draft's content as HTML, Markdown or plain text. Only the first ${MAX_DRAFT_CHARS} characters are analysed; longer drafts are trimmed and the output says so.`,
    ),
  ownUrl: z
    .string()
    .min(1)
    .optional()
    .describe(
      "URL of one of our existing pages. It is fetched and outlined in place of `draft`. If both `ownUrl` and `draft` are given, `ownUrl` wins and `draft` is ignored.",
    ),
  competitorCount: z
    .number()
    .int()
    .min(1)
    .max(MAX_COMPETITOR_COUNT)
    .optional()
    .describe(
      `How many top organic pages to read, default ${DEFAULT_COMPETITOR_COUNT}, maximum ${MAX_COMPETITOR_COUNT}.`,
    ),
});

const pageOutlineSchema = z.looseObject({
  title: z.string().nullable(),
  metaDescription: z.string().nullable(),
  h1: z.string().nullable(),
  headings: z.array(z.looseObject({ level: z.number(), text: z.string() })),
  wordCount: z.number(),
  structuredDataTypes: z.array(z.string()),
  imageCount: z.number(),
  bodyText: z.string(),
  bodyTextTruncated: z.boolean(),
});

const organicResultSchema = z.looseObject({
  position: z.number().nullable(),
  domain: z.string().nullable(),
  url: z.string().nullable(),
  title: z.string().nullable(),
  referringDomains: z.number().nullable(),
  backlinks: z.number().nullable(),
  isOurs: z.boolean(),
});

const competitorSchema = z.looseObject({
  position: z.number().nullable(),
  domain: z.string().nullable(),
  url: z.string(),
  referringDomains: z.number().nullable(),
  outline: pageOutlineSchema.nullable(),
  /** Set when `outline` is null: why the page couldn't be read. */
  unreadableReason: z.string().nullable(),
});

export const draftBenchmarkOutputSchema = z.looseObject({
  keyword: z.string(),
  locationCode: z.number(),
  languageCode: z.string(),
  organicResults: z.array(organicResultSchema),
  peopleAlsoAsk: z.array(z.string()),
  serpFeatures: z.array(z.string()),
  ourPosition: z
    .looseObject({
      position: z.number().nullable(),
      url: z.string().nullable(),
    })
    .nullable(),
  competitors: z.array(competitorSchema),
  draft: z
    .looseObject({
      source: z.enum(["draft", "ownUrl"]),
      url: z.string().nullable(),
      outline: pageOutlineSchema.nullable(),
      unreadableReason: z.string().nullable(),
    })
    .nullable(),
  winCheck: z
    .looseObject({
      competitorsWithData: z.number(),
      medianReferringDomains: z.number().nullable(),
      minReferringDomains: z.number().nullable(),
      maxReferringDomains: z.number().nullable(),
    })
    .describe("Referring domains across the competitor pages that were read."),
  /** Plain-language caveats, e.g. a trimmed draft or unreadable pages. */
  notes: z.array(z.string()),
});

export type PageOutline = z.infer<typeof pageOutlineSchema>;
export type DraftBenchmarkInput = z.infer<typeof draftBenchmarkInputSchema>;
export type DraftBenchmark = z.infer<typeof draftBenchmarkOutputSchema>;
