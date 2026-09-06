import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import { normalizeEmails } from "./emailNormalization";
export { normalizeEmails } from "./emailNormalization";

export async function resolveUsersByEmail(
  prisma: PrismaClient,
  emails: readonly string[],
): Promise<{ users: Array<{ id: string; email: string | null }>; missingEmails: string[] }> {
  const normalized = normalizeEmails(emails);
  if (normalized.length === 0) return { users: [], missingEmails: [] };

  const users = await prisma.user.findMany({
    where: { email: { in: normalized, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  const found = new Set(users.map((user) => user.email?.toLowerCase()).filter(Boolean));
  return {
    users,
    missingEmails: normalized.filter((email) => !found.has(email)),
  };
}
