import "server-only";

import { NextResponse } from "next/server";

import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";

const ALLOWED_ROLES = new Set(["admin", "publisher", "author"]);

export type ChallengePublisherAccess = {
  authenticated: boolean;
  allowed: boolean;
  userId: string | null;
  email: string | null;
  roles: string[];
};

export async function resolveChallengePublisherAccess(): Promise<ChallengePublisherAccess> {
  const access = await getCurrentUserAccess();

  if (!access.authenticated || !access.user) {
    return {
      authenticated: false,
      allowed: false,
      userId: null,
      email: null,
      roles: [],
    };
  }

  const roles = access.capabilities.roles;

  return {
    authenticated: true,
    allowed: roles.some((role) => ALLOWED_ROLES.has(role)),
    userId: access.user.id,
    email: access.user.email,
    roles,
  };
}

export async function requireChallengePublisherAccessApi() {
  const access = await resolveChallengePublisherAccess();

  if (!access.authenticated) {
    return {
      access,
      denied: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  if (!access.allowed) {
    return {
      access,
      denied: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return { access, denied: null };
}

export async function requireChallengePublisherApi() {
  const { denied } = await requireChallengePublisherAccessApi();
  return denied;
}
