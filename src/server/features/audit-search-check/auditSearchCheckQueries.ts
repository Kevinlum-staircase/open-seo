/**
 * Read-only audit queries for the search check. They live here rather than in
 * AuditRepository because the check needs canonical and robots columns that
 * the repository's page reads leave out.
 * Provider-aware (D1 or Postgres) via the `@/db` handle, like the repository.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { audits, auditPages } from "@/db/schema";

/** A specific audit of the project, whatever its status. */
async function getAudit(projectId: string, auditId: string) {
  return db.query.audits.findFirst({
    where: and(eq(audits.id, auditId), eq(audits.projectId, projectId)),
  });
}

/** Recent completed audits, newest first. */
async function listCompletedAudits(projectId: string) {
  return db.query.audits.findMany({
    where: and(eq(audits.projectId, projectId), eq(audits.status, "completed")),
    orderBy: desc(audits.startedAt),
    limit: 50,
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
  getAudit,
  listCompletedAudits,
  getPagesForSearchCheck,
};
