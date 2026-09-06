import {
  getCurrentUserAccess,
} from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
} from "@/lib/http/appCors";
import {
  markLearningAnnouncementRead,
} from "@/lib/learningAnnouncements/learningAnnouncements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

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

  const access =
    await getCurrentUserAccess();

  if (
    !access.authenticated ||
    !access.user
  ) {
    return appCorsJson(
      request,
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const { id } = await context.params;

  try {
    await markLearningAnnouncementRead({
      announcementId: id,
      userId: access.user.id,
    });
  } catch {
    return appCorsJson(
      request,
      { error: "Announcement not found." },
      { status: 404 },
    );
  }

  return appCorsJson(request, {
    ok: true,
  });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
