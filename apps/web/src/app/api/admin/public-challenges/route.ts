import { resolveTaggedPresentation } from "@/i18n/resolveTaggedPresentation";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { listPublishedChallengeExerciseOptions } from "@/lib/practice/challenges/publishedCatalog";
import { resolveChallengePublisherAccess } from "@/lib/practice/challenges/publisherAccess";

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

  const access = await resolveChallengePublisherAccess();

  if (!access.authenticated) {
    return appCorsJson(
      request,
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  if (!access.allowed) {
    return appCorsJson(
      request,
      { error: "Publisher access required." },
      { status: 403 },
    );
  }

  const options = await listPublishedChallengeExerciseOptions();

  const payload = await resolveTaggedPresentation(
    JSON.parse(
      JSON.stringify({
        access: {
          authenticated: true,
          allowed: true,
        },
        options,
        counts: {
          total: options.length,
          quiz: options.filter(
            (option) => option.exercisePurpose === "quiz",
          ).length,
          project: options.filter(
            (option) => option.exercisePurpose === "project",
          ).length,
        },
      }),
    ),
  );

  return appCorsJson(request, payload);
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
