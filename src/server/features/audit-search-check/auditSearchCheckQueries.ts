/**
 * Read-only audit queries for the search check. They live here rather than in
 * AuditRepository because the check needs canonical and robots columns that
 * the repository's page reads leave out.
 * Provider-aware (D1 or Postgres) via the `@/db` handle, like the repository.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { audits, auditPages } from "@/db/schema";

/** The audit to check: the given one, or the newest that finished. */
async function getAuditToCheck(projectId: string, auditId?: string) {
  return db.query.audits.findFirst({
    where: auditId
      ? and(eq(audits.id, auditId), eq(audits.projectId, projectId))
      : and(eq(audits.projectId, projectId), eq(audits.status, "completed")),
    orderBy: desc(audits.startedAt),
  });
}

async function getPagesForSearchCheck(auditId: string) {
  return db
    .select({
      url: auditPages.url,
      statusCode: auditPages.statusCode,
      fetchClass: auditPages.fetchClass,
      redirectUrl: auditPages.redirectUrl,
      canonicalUrl: auditPages.canonicalUrl,
      robotsMeta: auditPages.robotsMeta,
      xRobotsTag: auditPages.xRobotsTag,
    })
    .from(auditPages)
    .where(eq(auditPages.auditId, auditId));
}

export const AuditSearchCheckQueries = {
  getAuditToCheck,
  getPagesForSearchCheck,
};
