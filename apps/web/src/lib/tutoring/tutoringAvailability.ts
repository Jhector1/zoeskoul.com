import "server-only";

import { prisma } from "@/lib/prisma";

export const MAX_TUTORING_AVAILABILITY_WINDOWS = 200;
export const MAX_TUTORING_AVAILABILITY_HORIZON_DAYS = 180;

export type TutoringAvailabilityWindowInput = {
  startsAt: Date;
  endsAt: Date;
};

export type NormalizedTutoringAvailability = {
  timeZone: string;
  windows: TutoringAvailabilityWindowInput[];
};

export class InvalidTutoringAvailabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTutoringAvailabilityError";
  }
}

export function isValidIanaTimeZone(value: string): boolean {
  const timeZone = value.trim();
  if (!timeZone) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(
      new Date("2026-01-01T00:00:00.000Z"),
    );
    return true;
  } catch {
    return false;
  }
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function normalizeTutoringAvailability(args: {
  timeZone: string;
  windows: readonly TutoringAvailabilityWindowInput[];
  now?: Date;
}): NormalizedTutoringAvailability {
  const timeZone = args.timeZone.trim();
  if (!isValidIanaTimeZone(timeZone)) {
    throw new InvalidTutoringAvailabilityError(
      "Tutoring availability requires a valid IANA timezone.",
    );
  }

  if (args.windows.length > MAX_TUTORING_AVAILABILITY_WINDOWS) {
    throw new InvalidTutoringAvailabilityError(
      `Tutoring availability supports at most ${MAX_TUTORING_AVAILABILITY_WINDOWS} windows.`,
    );
  }

  const now = args.now ?? new Date();
  const horizon = new Date(
    now.getTime() +
      MAX_TUTORING_AVAILABILITY_HORIZON_DAYS * 24 * 60 * 60_000,
  );

  const windows = args.windows
    .map((window) => ({
      startsAt: new Date(window.startsAt),
      endsAt: new Date(window.endsAt),
    }))
    .sort(
      (left, right) =>
        left.startsAt.getTime() - right.startsAt.getTime(),
    );

  for (const window of windows) {
    if (!validDate(window.startsAt) || !validDate(window.endsAt)) {
      throw new InvalidTutoringAvailabilityError(
        "Tutoring availability contains an invalid date.",
      );
    }

    if (window.endsAt <= window.startsAt) {
      throw new InvalidTutoringAvailabilityError(
        "Tutoring availability windows must end after they start.",
      );
    }

    if (window.endsAt <= now) {
      throw new InvalidTutoringAvailabilityError(
        "Tutoring availability windows must extend into the future.",
      );
    }

    if (window.startsAt > horizon || window.endsAt > horizon) {
      throw new InvalidTutoringAvailabilityError(
        `Tutoring availability cannot extend more than ${MAX_TUTORING_AVAILABILITY_HORIZON_DAYS} days ahead.`,
      );
    }
  }

  for (let index = 1; index < windows.length; index += 1) {
    if (windows[index].startsAt < windows[index - 1].endsAt) {
      throw new InvalidTutoringAvailabilityError(
        "Tutoring availability windows cannot overlap.",
      );
    }
  }

  return { timeZone, windows };
}

export function tutoringWindowCovers(args: {
  availabilityStartsAt: Date;
  availabilityEndsAt: Date;
  bookingStartsAt: Date;
  durationMinutes: number;
}): boolean {
  if (
    !Number.isSafeInteger(args.durationMinutes) ||
    args.durationMinutes <= 0
  ) {
    return false;
  }

  const bookingEndsAt = new Date(
    args.bookingStartsAt.getTime() +
      args.durationMinutes * 60_000,
  );

  return (
    args.availabilityStartsAt <= args.bookingStartsAt &&
    args.availabilityEndsAt >= bookingEndsAt
  );
}

export async function getOwnTutoringAvailability(
  teacherId: string,
) {
  const pool = await prisma.tutoringTeacherPoolMember.findUnique({
    where: { userId: teacherId },
    select: {
      userId: true,
      enabled: true,
      priority: true,
      timeZone: true,
      availabilityWindows: {
        where: { endsAt: { gt: new Date() } },
        orderBy: { startsAt: "asc" },
        take: MAX_TUTORING_AVAILABILITY_WINDOWS,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
  });

  return (
    pool ?? {
      userId: teacherId,
      enabled: false,
      priority: 100,
      timeZone: "UTC",
      availabilityWindows: [],
    }
  );
}

export async function replaceOwnTutoringAvailability(args: {
  teacherId: string;
  timeZone: string;
  windows: readonly TutoringAvailabilityWindowInput[];
  now?: Date;
}) {
  const normalized = normalizeTutoringAvailability(args);

  return prisma.$transaction(async (tx) => {
    const pool = await tx.tutoringTeacherPoolMember.upsert({
      where: { userId: args.teacherId },
      create: {
        userId: args.teacherId,
        enabled: false,
        priority: 100,
        timeZone: normalized.timeZone,
      },
      update: {
        timeZone: normalized.timeZone,
      },
      select: {
        userId: true,
        enabled: true,
        priority: true,
        timeZone: true,
      },
    });

    await tx.tutoringTeacherAvailabilityWindow.deleteMany({
      where: { teacherId: args.teacherId },
    });

    if (normalized.windows.length) {
      await tx.tutoringTeacherAvailabilityWindow.createMany({
        data: normalized.windows.map((window) => ({
          teacherId: args.teacherId,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
        })),
      });
    }

    const availabilityWindows =
      await tx.tutoringTeacherAvailabilityWindow.findMany({
        where: { teacherId: args.teacherId },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
        },
      });

    return {
      ...pool,
      availabilityWindows,
    };
  });
}
