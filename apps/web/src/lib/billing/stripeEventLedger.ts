import "server-only";

import { prisma } from "@/lib/prisma";

export const STRIPE_EVENT_PROCESSING_STALE_MS = 5 * 60 * 1000;
export const STRIPE_EVENT_ERROR_MAX_LENGTH = 2000;

type StripeEventTerminalStatus = "processed" | "ignored";
type StripeEventProcessingStatus =
  | "processing"
  | StripeEventTerminalStatus
  | "failed";

type StripeEventRecord = {
  id: string;
  status: string;
  attemptCount: number;
  updatedAt: Date;
};

type StripeEventCreateInput = {
  id: string;
  type: string;
  livemode: boolean;
  created: number;
  objectId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  status: StripeEventProcessingStatus;
  attemptCount: number;
  processedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
};

export type StripeEventLedgerClient = {
  stripeEvent: {
    create(args: { data: StripeEventCreateInput }): Promise<StripeEventRecord>;
    findUnique(args: {
      where: { id: string };
      select: { id: true; status: true; attemptCount: true; updatedAt: true };
    }): Promise<StripeEventRecord | null>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
};

export type StripeEventClaimInput = {
  id: string;
  type: string;
  livemode: boolean;
  created: number;
  objectId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
};

export type StripeEventClaimResult =
  | { kind: "claimed"; recovered: boolean; attemptCount: number }
  | { kind: "duplicate"; status: StripeEventTerminalStatus }
  | { kind: "in_progress" };

type ClaimOptions = {
  client?: StripeEventLedgerClient;
  now?: Date;
  staleAfterMs?: number;
};

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function referencesForUpdate(input: StripeEventClaimInput) {
  return {
    objectId: input.objectId ?? null,
    customerId: input.customerId ?? null,
    subscriptionId: input.subscriptionId ?? null,
  };
}

export function stripeEventErrorText(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Stripe event processing failed";

  return raw.slice(0, STRIPE_EVENT_ERROR_MAX_LENGTH);
}

async function readExistingEvent(
  client: StripeEventLedgerClient,
  eventId: string,
): Promise<StripeEventRecord> {
  const existing = await client.stripeEvent.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, attemptCount: true, updatedAt: true },
  });

  if (!existing) {
    throw new Error(`Stripe event ${eventId} could not be loaded after a unique conflict`);
  }

  return existing;
}

async function resultAfterLostReclaim(
  client: StripeEventLedgerClient,
  eventId: string,
): Promise<StripeEventClaimResult> {
  const latest = await readExistingEvent(client, eventId);
  if (latest.status === "processed" || latest.status === "ignored") {
    return { kind: "duplicate", status: latest.status };
  }
  return { kind: "in_progress" };
}

export async function claimStripeEvent(
  input: StripeEventClaimInput,
  options: ClaimOptions = {},
): Promise<StripeEventClaimResult> {
  const client =
    options.client ?? (prisma as unknown as StripeEventLedgerClient);
  const now = options.now ?? new Date();
  const staleAfterMs =
    options.staleAfterMs ?? STRIPE_EVENT_PROCESSING_STALE_MS;
  const staleBefore = new Date(now.getTime() - staleAfterMs);

  try {
    await client.stripeEvent.create({
      data: {
        id: input.id,
        type: input.type,
        livemode: input.livemode,
        created: input.created,
        ...referencesForUpdate(input),
        status: "processing",
        attemptCount: 1,
        processedAt: null,
        lastError: null,
        updatedAt: now,
      },
    });

    return { kind: "claimed", recovered: false, attemptCount: 1 };
  } catch (error: unknown) {
    if (!isPrismaUniqueConstraintError(error)) throw error;
  }

  const existing = await readExistingEvent(client, input.id);

  if (existing.status === "processed" || existing.status === "ignored") {
    return { kind: "duplicate", status: existing.status };
  }

  const reclaimData = {
    status: "processing",
    attemptCount: { increment: 1 },
    processedAt: null,
    lastError: null,
    updatedAt: now,
    ...referencesForUpdate(input),
  };

  if (existing.status === "failed") {
    const reclaimed = await client.stripeEvent.updateMany({
      where: {
        id: input.id,
        status: "failed",
        attemptCount: existing.attemptCount,
      },
      data: reclaimData,
    });

    return reclaimed.count === 1
      ? {
          kind: "claimed",
          recovered: true,
          attemptCount: existing.attemptCount + 1,
        }
      : resultAfterLostReclaim(client, input.id);
  }

  if (
    existing.status === "processing" &&
    existing.updatedAt.getTime() <= staleBefore.getTime()
  ) {
    const reclaimed = await client.stripeEvent.updateMany({
      where: {
        id: input.id,
        status: "processing",
        attemptCount: existing.attemptCount,
        updatedAt: { lte: staleBefore },
      },
      data: reclaimData,
    });

    return reclaimed.count === 1
      ? {
          kind: "claimed",
          recovered: true,
          attemptCount: existing.attemptCount + 1,
        }
      : resultAfterLostReclaim(client, input.id);
  }

  return { kind: "in_progress" };
}

async function markTerminalStatus(
  eventId: string,
  attemptCount: number,
  status: StripeEventTerminalStatus,
  note: string | null,
  options: { client?: StripeEventLedgerClient; now?: Date } = {},
): Promise<boolean> {
  const client =
    options.client ?? (prisma as unknown as StripeEventLedgerClient);
  const now = options.now ?? new Date();

  const updated = await client.stripeEvent.updateMany({
    where: { id: eventId, status: "processing", attemptCount },
    data: {
      status,
      processedAt: now,
      lastError: note,
      updatedAt: now,
    },
  });

  return updated.count === 1;
}

export function markStripeEventProcessed(
  eventId: string,
  attemptCount: number,
  options: { client?: StripeEventLedgerClient; now?: Date } = {},
): Promise<boolean> {
  return markTerminalStatus(
    eventId,
    attemptCount,
    "processed",
    null,
    options,
  );
}

export function markStripeEventIgnored(
  eventId: string,
  attemptCount: number,
  reason: string,
  options: { client?: StripeEventLedgerClient; now?: Date } = {},
): Promise<boolean> {
  return markTerminalStatus(
    eventId,
    attemptCount,
    "ignored",
    stripeEventErrorText(reason),
    options,
  );
}

export async function markStripeEventFailed(
  eventId: string,
  attemptCount: number,
  error: unknown,
  options: { client?: StripeEventLedgerClient; now?: Date } = {},
): Promise<boolean> {
  const client =
    options.client ?? (prisma as unknown as StripeEventLedgerClient);
  const now = options.now ?? new Date();

  const updated = await client.stripeEvent.updateMany({
    where: { id: eventId, status: "processing", attemptCount },
    data: {
      status: "failed",
      processedAt: null,
      lastError: stripeEventErrorText(error),
      updatedAt: now,
    },
  });

  return updated.count === 1;
}
