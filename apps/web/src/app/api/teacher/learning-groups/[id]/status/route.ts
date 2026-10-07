import { learningGroupWhereForTeachingUser } from "@/lib/teaching/classAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
} from "@/lib/http/appCors";
import {
  autoDeliverLearningGroupInvites,
  resolveLearningGroupInviteLocaleFromRequest,
} from "@/lib/learningGroups/groupInviteDelivery";
import { syncPendingLearningGroupInvites } from "@/lib/learningGroups/groupInvites";
import { prisma } from "@/lib/prisma";
import {
  getTeachingUser,
} from "@/lib/teaching/teachingAccess";
import { LearningGroupStatusUpdateSchema } from "@/lib/validators/learningDelivery";

type Context = { params: Promise<{ id: string }> };

function routeJson(request: Request, body: unknown, status = 200) {
  return appCorsJson(request, body, { status });
}

function canTransition(
  current: "draft" | "open" | "closed",
  next: "open" | "closed",
) {
  if (current === next) return true;
  if (current === "draft" && next === "open") return true;
  if (current === "open" && next === "closed") return true;
  if (current === "closed" && next === "open") return true;
  return false;
}

const groupInclude = {
  organization: {
    select: { id: true, name: true, slug: true },
  },
  members: {
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  },
  invites: {
    orderBy: { email: "asc" as const },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      sentAt: true,
      acceptedAt: true,
      acceptedByUserId: true,
      revokedAt: true,
    },
  },
  _count: { select: { assignments: true } },
};

export async function PATCH(request: Request, context: Context) {
  if (!isAppMutationOriginAllowed(request)) {
    return routeJson(request, { error: "Forbidden" }, 403);
  }

  const teachingUser = await getTeachingUser();
  if (!teachingUser) return routeJson(request, { error: "Forbidden" }, 403);

  const parsed = LearningGroupStatusUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return routeJson(
      request,
      { error: "Invalid class status", details: parsed.error.flatten() },
      400,
    );
  }

  const { id } = await context.params;
  const current = await prisma.learningGroup.findFirst({
    where: { id, ...learningGroupWhereForTeachingUser(teachingUser) },
    select: {
      id: true,
      status: true,
      invites: {
        where: {
          acceptedAt: null,
          revokedAt: null,
        },
        select: {
          email: true,
          sentAt: true,
          expiresAt: true,
        },
      },
    },
  });

  if (!current) return routeJson(request, { error: "Not found" }, 404);
  if (!canTransition(current.status, parsed.data.status)) {
    return routeJson(
      request,
      {
        error: `Class cannot move from ${current.status} to ${parsed.data.status}.`,
        code: "INVALID_CLASS_STATUS_TRANSITION",
      },
      409,
    );
  }

  if (current.status !== parsed.data.status) {
    await prisma.learningGroup.update({
      where: { id },
      data: { status: parsed.data.status },
    });
  }

  const opening = parsed.data.status === "open" && current.status !== "open";
  let inviteDelivery = { attempted: 0, sent: 0, failed: 0 };

  if (opening && current.invites.length) {
    const now = new Date();
    const inviteSync = await syncPendingLearningGroupInvites(prisma, {
      groupId: id,
      pendingEmails: current.invites.map((invite) => invite.email),
      now,
    });
    const emailsToDeliver = [
      ...new Set([
        ...current.invites
          .filter((invite) => !invite.sentAt || invite.expiresAt <= now)
          .map((invite) => invite.email),
        ...inviteSync.autoDeliveryEmails,
      ]),
    ];

    inviteDelivery = await autoDeliverLearningGroupInvites(prisma, {
      groupId: id,
      emails: emailsToDeliver,
      origin: new URL(request.url).origin,
      locale: resolveLearningGroupInviteLocaleFromRequest(request),
    });
  }

  const group = await prisma.learningGroup.findUniqueOrThrow({
    where: { id },
    include: groupInclude,
  });

  return routeJson(request, { group, inviteDelivery });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
