import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import { gatePracticeModuleAccess } from "@/lib/billing/gatePracticeModuleAccess";
import { resolvePracticeExperienceMode } from "@/lib/practice/experience/resolve";
import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import { resolveActorRoleCapabilities } from "@/lib/access/roleCapabilitiesServer";

export type PracticeAccessResolved =
  | {
      ok: true;
      mode: PracticeExperienceMode;
      bypassBilling: boolean;
    }
  | {
      ok: false;
      res: Response;
    };

export async function resolvePracticeAccess(args: {
  prisma: PrismaClient;
  actor: Actor;
  locale: string;
  req: Request;
  params: {
    subject?: string | null;
    module?: string | null;
    sessionId?: string | null;
    returnUrl?: string | null;
    returnTo?: string | null;
  };
  session?: {
    id?: string | null;
    mode?: string | null;
    assignmentId?: string | null;
    meta?: unknown;
  } | null;
}): Promise<PracticeAccessResolved> {
  const { prisma, actor, locale, params, session } = args;
  const mode = resolvePracticeExperienceMode(session);

  // These experiences are deliberately accessible without module billing.
  // Assignment entitlement is enforced separately against the assignment owner.
  if (
    mode === "onboarding_trial" ||
    mode === "public_challenge" ||
    mode === "daily_five" ||
    mode === "assignment"
  ) {
    return { ok: true, mode, bypassBilling: true };
  }

  const capabilities = await resolveActorRoleCapabilities(prisma, actor);
  if (capabilities.canBypassBilling) {
    return { ok: true, mode, bypassBilling: true };
  }

  const gate = await gatePracticeModuleAccess({
    prisma,
    actor,
    locale,
    subject: params.subject ?? null,
    module: params.module ?? null,
    sessionId: params.sessionId ?? null,
    returnUrl: params.returnUrl ?? null,
    returnTo: params.returnTo ?? null,
    bypass: false,
  });

  if (!gate.ok) {
    return { ok: false, res: gate.res };
  }

  return { ok: true, mode, bypassBilling: false };
}
