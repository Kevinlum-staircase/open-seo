import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { SerpLiveItem } from "@/server/lib/dataforseo/serp";
import { normalizeDomainInput } from "@/server/lib/domainUtils";
import { fetchPageHtml } from "@/server/lib/scrape";
import {
  draftToHtml,
  extractPageOutline,
} from "@/server/features/draft-test/services/extractPageOutline";
import {
  DEFAULT_COMPETITOR_COUNT,
  MAX_DRAFT_CHARS,
  type DraftBenchmark,
  type PageOutline,
} from "@/types/schemas/draftBenchmark";

const SERP_DEPTH = 10;
/** Hard ceiling per page, so one slow site can't stall the whole call. */
const PAGE_FETCH_TIMEOUT_MS = 15_000;

const paaItemsSchema = z.array(z.object({ title: z.string().nullish() }));

type PageRead =
  | { outline: PageOutline; unreadableReason: null }
  | { outline: null; unreadableReason: string };

async function readPageOutline(url: string): Promise<PageRead> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), PAGE_FETCH_TIMEOUT_MS);
  });
  try {
    const html = await Promise.race([fetchPageHtml(url), timeout]);
    if (html === "timeout") return unreadable("timed out");
    if (html === null) {
      return unreadable("blocked, unreachable or returned an error");
    }
    const outline = extractPageOutline(html);
    if (outline.wordCount === 0) {
      return unreadable(
        "no readable text (likely built with JavaScript or bot-blocked)",
      );
    }
    return { outline, unreadableReason: null };
  } catch {
    return unreadable("could not be read");
  } finally {
    clearTimeout(timer);
  }
}

function unreadable(reason: string): PageRead {
  return { outline: null, unreadableReason: reason };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  // eslint-disable-next-line unicorn/no-array-sort -- the TS lib target lacks toSorted, and this is our own copy
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isOurDomain(domain: string | null | undefined, ours: string | null) {
  if (!domain || !ours) return false;
  const host = domain.toLowerCase();
  return host === ours || host.endsWith(`.${ours}`);
}

function extractPeopleAlsoAsk(items: SerpLiveItem[]): string[] {
  const questions = items
    .filter((item) => item.type === "people_also_ask")
    .flatMap((item) => {
      const parsed = paaItemsSchema.safeParse(item.items);
      return parsed.success ? parsed.data.map((entry) => entry.title) : [];
    })
    .filter((title): title is string => Boolean(title));
  return [...new Set(questions)];
}

async function outlineOurPage(input: {
  draft?: string;
  ownUrl?: string;
}): Promise<{ page: DraftBenchmark["draft"]; notes: string[] }> {
  const notes: string[] = [];
  // ownUrl wins over draft (documented on the tool).
  if (input.ownUrl) {
    const read = await readPageOutline(input.ownUrl);
    if (read.unreadableReason) {
      notes.push(
        `Our page ${input.ownUrl} couldn't be read: ${read.unreadableReason}.`,
      );
    }
    return {
      page: { source: "ownUrl", url: input.ownUrl, ...read },
      notes,
    };
  }
  if (input.draft === undefined) return { page: null, notes };

  let draft = input.draft;
  if (draft.length > MAX_DRAFT_CHARS) {
    notes.push(
      `The draft was ${draft.length} characters; only the first ${MAX_DRAFT_CHARS} were analysed, so its word count and headings cover just that part.`,
    );
    draft = draft.slice(0, MAX_DRAFT_CHARS);
  }
  // Claude already holds the draft's text, so skip the body excerpt.
  const outline = extractPageOutline(draftToHtml(draft), 0);
  return {
    page: { source: "draft", url: null, outline, unreadableReason: null },
    notes,
  };
}

async function getBenchmark(input: {
  billing: BillingCustomerContext;
  projectDomain: string | null;
  keyword: string;
  locationCode: number;
  languageCode: string;
  draft?: string;
  ownUrl?: string;
  competitorCount?: number;
}): Promise<DraftBenchmark> {
  // A project without a domain simply has nothing to exclude.
  const ours = input.projectDomain
    ? normalizeDomainInput(input.projectDomain, true)
    : null;
  const competitorCount = input.competitorCount ?? DEFAULT_COMPETITOR_COUNT;

  // Step 1: live results. One metered request.
  const client = createDataforseoClient(input.billing);
  const items = await client.serp.live({
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    depth: SERP_DEPTH,
  });

  const organic = items
    .filter((item) => item.type === "organic")
    .map((item) => ({
      position: item.rank_group ?? item.rank_absolute ?? null,
      domain: item.domain ?? null,
      url: item.url ?? null,
      title: item.title ?? null,
      referringDomains: item.backlinks_info?.referring_domains ?? null,
      backlinks: item.backlinks_info?.backlinks ?? null,
      isOurs: isOurDomain(item.domain, ours),
    }))
    .slice(0, SERP_DEPTH);

  // Step 2: our position. The first organic match is the best-ranked one.
  const ourResult = organic.find((result) => result.isOurs);

  // Steps 3 and 4: read the top competitor pages in parallel. Failures are
  // recorded per page and never fail the call.
  const competitorResults = organic
    .filter(
      (result): result is typeof result & { url: string } =>
        !result.isOurs && result.url !== null,
    )
    .slice(0, competitorCount);
  const [competitors, ourPage] = await Promise.all([
    Promise.all(
      competitorResults.map(async (result) => ({
        position: result.position,
        domain: result.domain,
        url: result.url,
        referringDomains: result.referringDomains,
        ...(await readPageOutline(result.url)),
      })),
    ),
    // Step 5: break our draft (or live page) down the same way.
    outlineOurPage(input),
  ]);

  // Step 6: win check, computed in code.
  const referringDomains = competitors
    .map((competitor) => competitor.referringDomains)
    .filter((value): value is number => value !== null);

  const notes = [...ourPage.notes];
  const unread = competitors.filter((competitor) => !competitor.outline);
  if (unread.length > 0) {
    notes.push(
      `${unread.length} of ${competitors.length} competitor pages couldn't be read, so the comparison is partial.`,
    );
  }
  if (input.ownUrl && input.draft !== undefined) {
    notes.push("Both ownUrl and draft were given; ownUrl was used.");
  }

  return {
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    organicResults: organic,
    peopleAlsoAsk: extractPeopleAlsoAsk(items),
    serpFeatures: [...new Set(items.map((item) => item.type).filter(Boolean))],
    ourPosition: ourResult
      ? { position: ourResult.position, url: ourResult.url }
      : null,
    competitors: competitors.map((competitor) => ({
      position: competitor.position,
      domain: competitor.domain,
      url: competitor.url,
      referringDomains: competitor.referringDomains,
      outline: competitor.outline,
      unreadableReason: competitor.unreadableReason,
    })),
    draft: ourPage.page,
    winCheck: {
      competitorsWithData: referringDomains.length,
      medianReferringDomains: median(referringDomains),
      minReferringDomains: referringDomains.length
        ? Math.min(...referringDomains)
        : null,
      maxReferringDomains: referringDomains.length
        ? Math.max(...referringDomains)
        : null,
    },
    notes,
  };
}

export const DraftBenchmarkService = { getBenchmark };
