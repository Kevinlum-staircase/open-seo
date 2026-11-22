import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AuditSearchCheckService } from "@/server/features/audit-search-check/AuditSearchCheckService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import type { AuditSearchCheck } from "@/types/schemas/auditSearchCheck";

const getAuditSearchChecksSchema = z.object({
  projectId: z.string().min(1),
  auditId: z.string().min(1),
  // The panel never runs URL Inspection on load (0); the button asks for 10.
  maxInspections: z.union([z.literal(0), z.literal(10)]).default(0),
});

/** The check's schema is a loose Zod object (it keeps unknown keys for MCP),
 *  whose `[x: string]: unknown` signatures TanStack cannot prove serializable.
 *  This drops those; the known fields and real records are unchanged. */
type WithoutIndexSignatures<T> = T extends (infer Item)[]
  ? WithoutIndexSignatures<Item>[]
  : T extends object
    ? {
        [K in keyof T as string extends K
          ? unknown extends T[K]
            ? never
            : K
          : K]: WithoutIndexSignatures<T[K]>;
      }
    : T;

export const getAuditSearchChecks = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getAuditSearchChecksSchema)
  .handler(async ({ data, context }) => {
    const check: WithoutIndexSignatures<AuditSearchCheck> =
      await AuditSearchCheckService.getSearchChecks({
        auditId: data.auditId,
        maxInspections: data.maxInspections,
        projectId: context.projectId,
        projectDomain: context.project.domain,
      });
    return check;
  });
