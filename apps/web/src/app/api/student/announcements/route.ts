import {
  getCurrentUserAccess,
} from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  listUnreadLearningAnnouncementsForStudent,
} from "@/lib/learningAnnouncements/learningAnnouncements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAppOriginAllowed(request)) {
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

  const announcements =
    await listUnreadLearningAnnouncementsForStudent(
      access.user.id,
    );

  return appCorsJson(request, {
    announcements,
  });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
