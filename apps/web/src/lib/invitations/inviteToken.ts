import { createHash, randomBytes } from "node:crypto";

export const CLASSROOM_INVITE_TTL_DAYS = 30;

export function hashClassroomInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createClassroomInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function classroomInviteExpiry(now = new Date()) {
  return new Date(
    now.getTime() + CLASSROOM_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function classroomInviteState(
  invite: {
    acceptedAt?: Date | string | null;
    revokedAt?: Date | string | null;
    expiresAt: Date | string;
  },
  now = new Date(),
) {
  if (invite.revokedAt) return "revoked" as const;
  if (invite.acceptedAt) return "accepted" as const;
  if (new Date(invite.expiresAt) <= now) return "expired" as const;
  return "pending" as const;
}

export function maskClassroomInviteEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}
