import { z } from "zod";

import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  listLearningAnnouncementsForTarget,
  publishLearningAnnouncement,
} from "@/lib/learningAnnouncements/learningAnnouncements";
import { prisma } from "@/lib/prisma";
import {
  getTeachingUser,
  ownedTeachingRecordWhere,
} from "@/lib/teaching/teachingAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

const PublishSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4_000),
});

async function resolveClass(id: string) {
  const teachingUser =
    await getTeachingUser();

  if (!teachingUser) {
    return {
      teachingUser: null,
      group: null,
    };
  }

  const group =
    await prisma.learningGroup.findFirst({
      where: {
        id,
        ...ownedTeachingRecordWhere(
          teachingUser,
        ),
      },
      select: {
        id: true,
      },
    });

  return {
    teachingUser,
    group,
  };
}

export async function GET(
  request: Request,
  context: Context,
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const { teachingUser, group } =
    await resolveClass(id);

  if (!teachingUser) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  if (!group) {
    return appCorsJson(
      request,
      { error: "Class not found." },
      { status: 404 },
    );
  }

  const announcements =
    await listLearningAnnouncementsForTarget(
      "class",
      id,
    );

  return appCorsJson(request, {
    announcements,
  });
}

export async function POST(
  request: Request,
  context: Context,
) {
  if (!isAppMutationOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const { teachingUser, group } =
    await resolveClass(id);

  if (!teachingUser) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  if (!group) {
    return appCorsJson(
      request,
      { error: "Class not found." },
      { status: 404 },
    );
  }

  const parsed = PublishSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return appCorsJson(
      request,
      { error: "Invalid announcement." },
      { status: 400 },
    );
  }

  const announcement =
    await publishLearningAnnouncement({
      scope: "class",
      targetId: id,
      authorId: teachingUser.id,
      ...parsed.data,
    });

  return appCorsJson(
    request,
    { announcement },
    { status: 201 },
  );
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
