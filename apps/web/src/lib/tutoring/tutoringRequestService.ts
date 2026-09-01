import "server-only";

import { prisma, type Prisma } from "@/lib/prisma";
import {
  InsufficientTutoringCreditsError,
  ensureTutoringRequestCreditsReserved,
  getTutoringCreditBalance,
  type TutoringCreditBalance,
} from "@/lib/tutoring/tutoringCommercial";
import { assertValidTutoringMinutes } from "@/lib/tutoring/tutoringPricing";

export type TutoringRequestView = {
  id: string;
  learnerId: string;
  requestAttemptId: string;
  assignedTeacherId: string | null;
  tutoringSessionId: string | null;
  status: string;
  requestedMinutes: number;
  preferredStartsAt: Date | null;
  sourceSubjectSlug: string | null;
  sourceModuleSlug: string | null;
  sourceExerciseKey: string | null;
  note: string | null;
  assignedAt: Date | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TeacherPoolMembership = {
  userId: string;
  enabled: boolean;
  priority: number;
};

export class TutoringRequestAttemptConflictError extends Error {
  constructor() {
    super(
      "This tutoring request attempt was already used for a different request.",
    );
    this.name = "TutoringRequestAttemptConflictError";
  }
}

type CreateRequestArgs = {
  learnerId: string;
  requestAttemptId: string;
  requestedMinutes: number;
  preferredStartsAt: string;
  sourceSubjectSlug?: string | null;
  sourceModuleSlug?: string | null;
  sourceExerciseKey?: string | null;
  note?: string | null;
};

export type TutoringRequestServiceDeps = {
  getBalance(userId: string): Promise<TutoringCreditBalance>;
  findByAttemptId(
    requestAttemptId: string,
  ): Promise<TutoringRequestView | null>;
  createRequest(args: CreateRequestArgs): Promise<TutoringRequestView>;
  reserveRequestCredits(
    requestId: string,
    learnerId: string,
    requestedMinutes: number,
  ): Promise<TutoringCreditBalance>;
  rollbackUnreservedRequest(
    requestId: string,
    learnerId: string,
  ): Promise<void>;
};

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizedCreateArgs(args: CreateRequestArgs): CreateRequestArgs {
  const preferredStartsAt = new Date(args.preferredStartsAt);
  if (!Number.isFinite(preferredStartsAt.getTime())) {
    throw new Error("Choose a valid preferred tutoring date and time.");
  }

  return {
    ...args,
    preferredStartsAt: preferredStartsAt.toISOString(),
    sourceSubjectSlug: normalizeOptional(args.sourceSubjectSlug),
    sourceModuleSlug: normalizeOptional(args.sourceModuleSlug),
    sourceExerciseKey: normalizeOptional(args.sourceExerciseKey),
    note: normalizeOptional(args.note),
  };
}

function assertLaunchSessionMinutes(
  minutes: number,
): void {
  assertValidTutoringMinutes(minutes);
}

function assertAttemptMatches(
  existing: TutoringRequestView,
  args: CreateRequestArgs,
): void {
  if (
    existing.learnerId !== args.learnerId ||
    existing.requestAttemptId !== args.requestAttemptId ||
    existing.requestedMinutes !== args.requestedMinutes ||
    existing.preferredStartsAt?.toISOString() !== args.preferredStartsAt ||
    existing.sourceSubjectSlug !== normalizeOptional(args.sourceSubjectSlug) ||
    existing.sourceModuleSlug !== normalizeOptional(args.sourceModuleSlug) ||
    existing.sourceExerciseKey !== normalizeOptional(args.sourceExerciseKey) ||
    existing.note !== normalizeOptional(args.note)
  ) {
    throw new TutoringRequestAttemptConflictError();
  }
}

function isPrismaUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error && String(error.code) === "P2002";
}

function defaultDeps(): TutoringRequestServiceDeps {
  return {
    getBalance: getTutoringCreditBalance,
    findByAttemptId: async (requestAttemptId) =>
      prisma.tutoringRequest.findUnique({
        where: { requestAttemptId },
        select: {
          id: true,
          learnerId: true,
          requestAttemptId: true,
          assignedTeacherId: true,
          tutoringSessionId: true,
          status: true,
          requestedMinutes: true,
          preferredStartsAt: true,
          sourceSubjectSlug: true,
          sourceModuleSlug: true,
          sourceExerciseKey: true,
          note: true,
          assignedAt: true,
          scheduledAt: true,
          completedAt: true,
          canceledAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    createRequest: async (args) =>
      prisma.tutoringRequest.create({
        data: {
          learnerId: args.learnerId,
          requestAttemptId: args.requestAttemptId,
          requestedMinutes: args.requestedMinutes,
          preferredStartsAt: new Date(args.preferredStartsAt),
          sourceSubjectSlug: args.sourceSubjectSlug ?? null,
          sourceModuleSlug: args.sourceModuleSlug ?? null,
          sourceExerciseKey: args.sourceExerciseKey ?? null,
          note: args.note ?? null,
          status: "requested",
        },
        select: {
          id: true,
          learnerId: true,
          requestAttemptId: true,
          assignedTeacherId: true,
          tutoringSessionId: true,
          status: true,
          requestedMinutes: true,
          preferredStartsAt: true,
          sourceSubjectSlug: true,
          sourceModuleSlug: true,
          sourceExerciseKey: true,
          note: true,
          assignedAt: true,
          scheduledAt: true,
          completedAt: true,
          canceledAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    reserveRequestCredits: async (
      requestId,
      learnerId,
      requestedMinutes,
    ) =>
      ensureTutoringRequestCreditsReserved({
        requestId,
        learnerId,
        requestedMinutes,
      }),
    rollbackUnreservedRequest: async (requestId, learnerId) => {
      await prisma.tutoringRequest.deleteMany({
        where: {
          id: requestId,
          learnerId,
          status: "requested",
          ledgerEntries: { none: {} },
          bookings: { none: {} },
        },
      });
    },
  };
}

export async function createLearnerTutoringRequest(
  args: CreateRequestArgs,
  options: { deps?: TutoringRequestServiceDeps } = {},
): Promise<{
  request: TutoringRequestView;
  balance: TutoringCreditBalance;
  resumed: boolean;
}> {
  assertLaunchSessionMinutes(args.requestedMinutes);
  const normalized = normalizedCreateArgs(args);
  const deps = options.deps ?? defaultDeps();

  const existing = await deps.findByAttemptId(normalized.requestAttemptId);
  if (existing) {
    assertAttemptMatches(existing, normalized);
    return {
      request: existing,
      balance: await deps.reserveRequestCredits(
        existing.id,
        normalized.learnerId,
        normalized.requestedMinutes,
      ),
      resumed: true,
    };
  }

  const balance = await deps.getBalance(normalized.learnerId);
  if (balance.availableMinutes < normalized.requestedMinutes) {
    throw new InsufficientTutoringCreditsError(
      balance.availableMinutes,
      normalized.requestedMinutes,
    );
  }

  try {
    const request = await deps.createRequest(normalized);

    try {
      const reservedBalance = await deps.reserveRequestCredits(
        request.id,
        normalized.learnerId,
        normalized.requestedMinutes,
      );
      return { request, balance: reservedBalance, resumed: false };
    } catch (error) {
      await deps
        .rollbackUnreservedRequest(request.id, normalized.learnerId)
        .catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (!isPrismaUniqueConflict(error)) throw error;

    const raced = await deps.findByAttemptId(normalized.requestAttemptId);
    if (!raced) throw error;

    assertAttemptMatches(raced, normalized);
    return {
      request: raced,
      balance: await deps.reserveRequestCredits(
        raced.id,
        normalized.learnerId,
        normalized.requestedMinutes,
      ),
      resumed: true,
    };
  }
}

export async function listLearnerTutoringRequests(
  learnerId: string,
): Promise<TutoringRequestView[]> {
  return prisma.tutoringRequest.findMany({
    where: { learnerId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      learnerId: true,
      requestAttemptId: true,
      assignedTeacherId: true,
      tutoringSessionId: true,
      status: true,
      requestedMinutes: true,
      preferredStartsAt: true,
      sourceSubjectSlug: true,
      sourceModuleSlug: true,
      sourceExerciseKey: true,
      note: true,
      assignedAt: true,
      scheduledAt: true,
      completedAt: true,
      canceledAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export function teacherQueueWhere(args: {
  teacherId: string;
  isAdmin: boolean;
  poolEnabled: boolean;
}): Prisma.TutoringRequestWhereInput {
  const openStatuses = ["requested", "assigned", "scheduled"] as const;

  if (args.isAdmin) {
    return { status: { in: [...openStatuses] } };
  }

  if (args.poolEnabled) {
    return {
      status: { in: [...openStatuses] },
      OR: [
        { assignedTeacherId: args.teacherId },
        { assignedTeacherId: null, status: "requested" },
      ],
    };
  }

  return {
    status: { in: [...openStatuses] },
    assignedTeacherId: args.teacherId,
  };
}

export async function getTutoringTeacherPoolMembership(
  userId: string,
): Promise<TeacherPoolMembership> {
  const membership = await prisma.tutoringTeacherPoolMember.findUnique({
    where: { userId },
    select: {
      userId: true,
      enabled: true,
      priority: true,
    },
  });

  return membership ?? { userId, enabled: false, priority: 100 };
}

export async function setOwnTutoringTeacherPoolEnabled(args: {
  userId: string;
  enabled: boolean;
}): Promise<TeacherPoolMembership> {
  return prisma.tutoringTeacherPoolMember.upsert({
    where: { userId: args.userId },
    create: {
      userId: args.userId,
      enabled: args.enabled,
      priority: 100,
    },
    update: { enabled: args.enabled },
    select: {
      userId: true,
      enabled: true,
      priority: true,
    },
  });
}

export async function listTutoringRequestQueue(args: {
  teacherId: string;
  isAdmin: boolean;
}) {
  const pool = await getTutoringTeacherPoolMembership(args.teacherId);

  const requests = await prisma.tutoringRequest.findMany({
    where: teacherQueueWhere({
      teacherId: args.teacherId,
      isAdmin: args.isAdmin,
      poolEnabled: pool.enabled,
    }),
    orderBy: [{ createdAt: "asc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      requestedMinutes: true,
      preferredStartsAt: true,
      sourceSubjectSlug: true,
      sourceModuleSlug: true,
      sourceExerciseKey: true,
      note: true,
      assignedTeacherId: true,
      tutoringSessionId: true,
      assignedAt: true,
      scheduledAt: true,
      createdAt: true,
      updatedAt: true,
      learner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assignedTeacher: {
        select: {
          id: true,
          name: true,
        },
      },
      bookings: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          startsAt: true,
          durationMinutes: true,
          status: true,
          tutoringSessionId: true,
        },
      },
    },
  });

  return { pool, requests };
}
