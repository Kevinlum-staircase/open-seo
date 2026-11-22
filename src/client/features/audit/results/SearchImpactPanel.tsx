import { useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { getAuditSearchChecks } from "@/serverFunctions/auditSearchCheck";

type AuditSearchCheck = Awaited<ReturnType<typeof getAuditSearchChecks>>;
type SearchCheckFinding = AuditSearchCheck["findings"][number];

const NOT_CRAWLED = "search-page-not-crawled";

const SEVERITY_DOT = {
  critical: "bg-error",
  warning: "bg-warning",
  info: "bg-base-content/30",
} as const;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : null;
}

/** The note the service attaches when Search Console could not be used. */
function findSearchConsoleNote(notes: string[]) {
  return notes.find(
    (note) =>
      note.includes("only Rank Tracking was used") &&
      !note.startsWith("URL Inspection skipped"),
  );
}

export function SearchImpactPanel({
  projectId,
  auditId,
}: {
  projectId: string;
  auditId: string;
}) {
  // 0 on load; the button switches to 10, which is a different query key, so
  // the inspected results never replace the cached no-inspection ones.
  const [maxInspections, setMaxInspections] = useState<0 | 10>(0);
  const query = useQuery({
    queryKey: ["audit-search-check", projectId, auditId, maxInspections],
    queryFn: () =>
      getAuditSearchChecks({ data: { projectId, auditId, maxInspections } }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        {query.data ? (
          <PanelContent
            projectId={projectId}
            check={query.data}
            isChecking={query.isFetching && maxInspections === 10}
            onCheckWithGoogle={() => {
              if (maxInspections === 10) void query.refetch();
              else setMaxInspections(10);
            }}
          />
        ) : (
          <PanelShell>
            {query.isError ? (
              <p className="text-sm text-base-content/60">
                Search impact could not be loaded. The rest of the audit is
                unaffected.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="skeleton h-12 w-full" />
                <div className="skeleton h-12 w-full" />
              </div>
            )}
          </PanelShell>
        )}
        {query.data && query.isError && (
          <p className="text-sm text-error">
            The last check failed. Showing the previous results.
          </p>
        )}
      </div>
    </div>
  );
}

function PanelShell({
  summary,
  action,
  children,
}: {
  summary?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold">Search impact</h2>
          <p className="text-sm text-base-content/60">
            Problems on pages Google shows or we track, from Search Console and
            Rank Tracking.
          </p>
          {summary}
        </div>
        {action}
      </div>
      {children}
    </>
  );
}

function PanelContent({
  projectId,
  check,
  isChecking,
  onCheckWithGoogle,
}: {
  projectId: string;
  check: AuditSearchCheck;
  isChecking: boolean;
  onCheckWithGoogle: () => void;
}) {
  const { summary, notes } = check;
  const critical = check.findings.filter((f) => f.severity === "critical");
  const warnings = check.findings.filter(
    (f) => f.severity !== "critical" && f.type !== NOT_CRAWLED,
  );
  const notCrawled = check.findings.filter((f) => f.type === NOT_CRAWLED);
  const notCrawledTotal = summary.countsByType[NOT_CRAWLED] ?? 0;
  // The service returns an empty result with no audit date when it has no
  // completed audit to check; Search Console is only "missing" for a real one.
  const hasAudit = summary.auditDate !== null;
  const searchConsoleNote = findSearchConsoleNote(notes);
  const searchConsoleMissing = hasAudit && summary.searchConsoleWindow === null;

  if (!hasAudit) {
    return (
      <PanelShell>
        <p className="text-sm text-base-content/60">
          {notes[0] ?? "Search impact is not available for this audit."}
        </p>
      </PanelShell>
    );
  }

  const dates = [
    `Audit ${formatDate(summary.auditDate)}`,
    summary.searchConsoleWindow
      ? `Search Console ${summary.searchConsoleWindow.startDate} to ${summary.searchConsoleWindow.endDate}`
      : null,
    summary.rankCheckDate
      ? `Rank check ${formatDate(summary.rankCheckDate)}`
      : null,
  ].filter(Boolean);

  return (
    <PanelShell
      summary={
        <>
          <p className="text-sm font-medium">
            {critical.length} critical, {warnings.length}{" "}
            {warnings.length === 1 ? "warning" : "warnings"}
          </p>
          <p className="text-xs text-base-content/50">{dates.join(" · ")}</p>
        </>
      }
      action={
        !searchConsoleMissing && notCrawledTotal > 0 ? (
          <button
            type="button"
            className="btn btn-outline btn-sm shrink-0 self-start"
            disabled={isChecking}
            onClick={onCheckWithGoogle}
          >
            {isChecking && (
              <span className="loading loading-spinner loading-xs" />
            )}
            Check top uncrawled pages with Google
          </button>
        ) : undefined
      }
    >
      {searchConsoleMissing && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <p>
            Search Console is not available.{" "}
            <Link
              to="/p/$projectId/settings/integrations"
              params={{ projectId }}
              className="link link-primary"
            >
              Connect Search Console
            </Link>{" "}
            for the full check.
          </p>
          {searchConsoleNote && (
            <p className="mt-1 text-xs text-base-content/60">
              {searchConsoleNote}
            </p>
          )}
        </div>
      )}

      {critical.length === 0 && warnings.length === 0 && (
        <p className="text-sm text-base-content/60">
          {notCrawledTotal > 0
            ? `No critical problems or warnings. ${notCrawledTotal} ${notCrawledTotal === 1 ? "page that gets" : "pages that get"} search traffic ${notCrawledTotal === 1 ? "wasn't" : "weren't"} reached by this audit (see below).`
            : "No search-impact problems on pages with search demand."}
        </p>
      )}

      {critical.length > 0 && (
        <div className="border border-base-300 rounded-lg overflow-hidden divide-y divide-base-300/60">
          {critical.map((finding) => (
            <FindingRow
              key={`${finding.type}:${finding.url}`}
              finding={finding}
            />
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <Disclosure
          label={
            warnings.length === 1
              ? "Show 1 warning"
              : `Show ${warnings.length} warnings`
          }
        >
          <div className="border border-base-300 rounded-lg overflow-hidden divide-y divide-base-300/60">
            {warnings.map((finding) => (
              <FindingRow
                key={`${finding.type}:${finding.url}`}
                finding={finding}
              />
            ))}
          </div>
        </Disclosure>
      )}

      {notCrawledTotal > 0 && (
        <Disclosure label={`Not crawled (${notCrawledTotal})`}>
          <p className="mb-2 text-sm text-base-content/60">
            Pages Google shows that this audit never reached: not linked, not in
            the sitemap, or past the page limit.
            {summary.inspectedCount > 0 &&
              ` ${summary.inspectedCount} checked with Google.`}
          </p>
          <div className="border border-base-300 rounded-lg overflow-hidden divide-y divide-base-300/60">
            {notCrawled.map((finding) => (
              <FindingRow key={finding.url} finding={finding} />
            ))}
          </div>
          {summary.notCrawledByFolder.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>Other not-crawled pages, by folder</th>
                    <th className="text-right">Pages</th>
                    <th className="text-right">Impressions</th>
                    <th className="text-right">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.notCrawledByFolder.map((group) => (
                    <tr key={group.folder}>
                      <td>{group.folder}</td>
                      <td className="text-right tabular-nums">{group.count}</td>
                      <td className="text-right tabular-nums">
                        {group.impressions}
                      </td>
                      <td className="text-right tabular-nums">
                        {group.clicks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Disclosure>
      )}

      {summary.ignoredPaths.length > 0 && (
        <p className="text-xs text-base-content/50">
          Ignoring {summary.ignoredPaths.join(", ")} (noindexed on purpose).{" "}
          <Link
            to="/p/$projectId/context"
            params={{ projectId }}
            className="link link-hover"
          >
            Edit in Context
          </Link>
          .
        </p>
      )}
    </PanelShell>
  );
}

function FindingRow({ finding }: { finding: SearchCheckFinding }) {
  return (
    <div className="px-4 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`size-2 shrink-0 rounded-full ${SEVERITY_DOT[finding.severity]}`}
        />
        <a
          className="link link-hover text-sm font-medium truncate"
          href={finding.url}
          target="_blank"
          rel="noreferrer"
          title={finding.url}
        >
          {finding.url}
        </a>
      </div>
      <p className="text-sm text-base-content/70">{finding.evidence}</p>
      <p className="text-xs text-base-content/50 tabular-nums">
        {finding.impressions} impressions · {finding.clicks} clicks
        {finding.trackedKeywords.length > 0 &&
          ` · ${finding.trackedKeywords
            .map(
              (tracked) =>
                `${tracked.keyword} (${tracked.device} #${tracked.position ?? "?"})`,
            )
            .join(", ")}`}
      </p>
      <Disclosure label="How to fix">
        <p className="text-sm text-base-content/80 max-w-prose">
          {finding.howToFix}
        </p>
      </Disclosure>
    </div>
  );
}

function Disclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-base-content/60 hover:text-base-content transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronRight
          className={`size-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}
