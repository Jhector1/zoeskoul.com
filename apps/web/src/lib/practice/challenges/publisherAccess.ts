import "server-only";

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";

const ALLOWED_ROLES = new Set(["admin", "publisher", "author"]);

function configuredPublisherEmails() {
  return new Set(
    [
      process.env.ADMIN_EMAILS ?? "",
      process.env.CHALLENGE_PUBLISHER_EMAILS ?? "",
    ]
      .join(",")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type ChallengePublisherAccess = {
  authenticated: boolean;
  allowed: boolean;
  userId: string | null;
  email: string | null;
  roles: string[];
};

export async function resolveChallengePublisherAccess(): Promise<ChallengePublisherAccess> {
  const session = await auth();
  const userId = (session?.user as { id?: string | null } | undefined)?.id ?? null;
  const email = session?.user?.email?.trim().toLowerCase() ?? null;

  if (!userId && !email) {
    return {
      authenticated: false,
      allowed: false,
      userId: null,
      email: null,
      roles: [],
    };
  }

  const privileged = await resolvePrivilegedLearningAccess({ userId, email });
  const roles = (privileged.roles ?? [])
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
  const roleAllowed = roles.some((role) => ALLOWED_ROLES.has(role));
  const emailAllowed = Boolean(email && configuredPublisherEmails().has(email));
  const localDevelopmentAllowed =
    process.env.NODE_ENV !== "production" &&
    process.env.CHALLENGE_LOCAL_DEV_ACCESS !== "0";

  return {
    authenticated: true,
    allowed: roleAllowed || emailAllowed || localDevelopmentAllowed,
    userId,
    email,
    roles,
  };
}

export async function requireChallengePublisherApi() {
  const access = await resolveChallengePublisherAccess();

  if (!access.authenticated) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return null;
}
