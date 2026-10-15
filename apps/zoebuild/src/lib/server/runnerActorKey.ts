import { createHash } from "node:crypto";

import { auth } from "@/lib/auth";

function sha(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export async function requireRunnerActorKey(): Promise<string> {
  const session = await auth();
  const userId = (session?.user as any)?.id ?? null;

  if (userId) {
    return `u:${sha(userId)}`;
  }

  if (
    process.env.E2E_ALLOW_DEV_ROUTES === "1" ||
    process.env.PLAYWRIGHT === "1" ||
    process.env.PLAYWRIGHT_TEST === "1"
  ) {
    return `e2e:${sha("playwright")}`;
  }

  throw new Error("Unauthorized");
}
