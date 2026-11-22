import { beforeEach, expect, it, vi } from "vitest";

const getProjectContextMock =
  vi.fn<(projectId: string) => Promise<{ customSections: object[] }>>();

vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: {
    getPerformance: vi.fn(async () => ({
      rows: [
        {
          keys: ["https://example.com/glossary/term"],
          clicks: 5,
          impressions: 500,
          position: 8,
        },
      ],
      request: { startDate: "2026-10-01", endDate: "2026-10-28" },
    })),
  },
  isExpectedGrantFailure: () => false,
}));

vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: { getConfigs: vi.fn(async () => []) },
}));

vi.mock("@/server/features/audit-search-check/auditSearchCheckQueries", () => ({
  AuditSearchCheckQueries: {
    getAudit: vi.fn(async () => ({
      id: "audit_1",
      status: "completed",
      startUrl: "https://example.com/",
      pagesCrawled: 1,
      startedAt: "2026-10-30T00:00:00Z",
      completedAt: "2026-10-30T00:05:00Z",
    })),
    getPagesForSearchCheck: vi.fn(async () => [
      {
        url: "https://example.com/glossary/term",
        statusCode: 200,
        fetchClass: "ok",
        redirectUrl: null,
        canonicalUrl: null,
        robotsMeta: "noindex",
        xRobotsTag: null,
      },
    ]),
  },
}));

vi.mock(
  "@/server/features/project-context/services/ProjectContextService",
  () => ({
    ProjectContextService: {
      getProjectContext: (projectId: string) =>
        getProjectContextMock(projectId),
    },
  }),
);

import { AuditSearchCheckService } from "./AuditSearchCheckService";

const request = {
  projectId: "project_1",
  projectDomain: "example.com",
  auditId: "audit_1",
  maxInspections: 0,
};

beforeEach(() => {
  getProjectContextMock.mockResolvedValue({
    customSections: [
      {
        slug: "deliberately-noindexed",
        content: "- /glossary/ (noindexed on purpose)",
      },
    ],
  });
});

it("ignores the Project Context paths when no ignorePaths is passed", async () => {
  const result = await AuditSearchCheckService.getSearchChecks(request);

  expect(result.findings).toEqual([]);
  expect(result.summary.ignoredPaths).toEqual(["/glossary/"]);
});

it("an explicit empty ignorePaths ignores nothing", async () => {
  const result = await AuditSearchCheckService.getSearchChecks({
    ...request,
    ignorePaths: [],
  });

  expect(result.findings).toMatchObject([
    { type: "noindex-page-with-search-demand" },
  ]);
  expect(getProjectContextMock).not.toHaveBeenCalled();
});
