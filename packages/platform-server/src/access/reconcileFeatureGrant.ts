import { createHash } from "node:crypto";

import {
  Prisma,
  type PrismaClient,
  type FeatureKey,
} from "@zoeskoul/db";

export type ReconcileFeatureGrantInput = Readonly<{
  client: PrismaClient;
  userId: string;
  actorKey: string;
  feature: FeatureKey;
  type: "subscription" | "purchase" | "assignment" | "admin" | "trial";
  active: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  now?: Date;
  meta?: Prisma.InputJsonValue;
}>;

export type ReconcileFeatureGrantResult = Readonly<{
  id: string;
  active: boolean;
  changed: boolean;
}>;

function normalized(value: string, label: string): string {
  const out = value.trim();
  if (!out) {
    throw new Error(`FeatureGrant ${label} is required.`);
  }
  return out;
}

export function canonicalUserActorKey(userId: string): string {
  const normalizedUserId = normalized(userId, "user id");
  const digest = createHash("sha256")
    .update(normalizedUserId)
    .digest("hex");

  return `u:${digest}`;
}

export function deterministicFeatureGrantId(args: {
  userId: string;
  feature: FeatureKey;
  type: ReconcileFeatureGrantInput["type"];
}): string {
  const digest = createHash("sha256")
    .update(`${args.type}:${args.feature}:${normalized(args.userId, "user id")}`)
    .digest("hex")
    .slice(0, 32);

  return `fg_${digest}`;
}

/**
 * Canonical idempotent FeatureGrant writer.
 *
 * One deterministic row is owned per user + feature + grant type. This avoids
 * duplicate rows when Stripe webhook delivery and sync-on-read converge at the
 * same time, without adding a new database uniqueness constraint.
 */
export async function reconcileFeatureGrant(
  input: ReconcileFeatureGrantInput,
): Promise<ReconcileFeatureGrantResult> {
  const userId = normalized(input.userId, "user id");
  const actorKey = normalized(input.actorKey, "actor key");
  const now = input.now ?? new Date();
  const id = deterministicFeatureGrantId({
    userId,
    feature: input.feature,
    type: input.type,
  });

  if (!input.active) {
    const revoked = await input.client.featureGrant.updateMany({
      where: {
        id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        endsAt: now,
      },
    });

    return {
      id,
      active: false,
      changed: revoked.count > 0,
    };
  }

  await input.client.featureGrant.upsert({
    where: { id },
    create: {
      id,
      actorKey,
      userId,
      feature: input.feature,
      type: input.type,
      startsAt: input.startsAt ?? now,
      endsAt: input.endsAt ?? null,
      revokedAt: null,
      ...(input.meta === undefined ? {} : { meta: input.meta }),
    },
    update: {
      actorKey,
      userId,
      feature: input.feature,
      type: input.type,
      endsAt: input.endsAt ?? null,
      revokedAt: null,
      ...(input.meta === undefined ? {} : { meta: input.meta }),
    },
  });

  return {
    id,
    active: true,
    changed: true,
  };
}
