import { db, schema } from "@/db";

/** Append to the admin audit trail. Every admin/agent action, no exceptions. */
export async function logAdminEvent(
  actor: string,
  action: string,
  marketId: number | null,
  detail: unknown,
): Promise<void> {
  await db.insert(schema.adminEvents).values({
    actor,
    action,
    marketId,
    detail: detail as object,
  });
}
