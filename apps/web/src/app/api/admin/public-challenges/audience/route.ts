import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  listPublicChallengeAudienceContacts,
  listPublicChallengeAudienceLists,
} from "@/lib/marketing/publicChallengeCampaign";
import { resolveChallengePublisherAccess } from "@/lib/practice/challenges/publisherAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveListId(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(request, { error: "Forbidden." }, { status: 403 });
  }

  const access = await resolveChallengePublisherAccess();
  if (!access.authenticated) {
    return appCorsJson(request, { error: "Unauthorized." }, { status: 401 });
  }
  if (!access.allowed) {
    return appCorsJson(
      request,
      { error: "Publisher access required." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const rawListId = url.searchParams.get("listId");

  try {
    if (rawListId == null) {
      return appCorsJson(
        request,
        await listPublicChallengeAudienceLists(),
      );
    }

    const listId = positiveListId(rawListId);
    if (!listId) {
      return appCorsJson(
        request,
        { error: "Invalid Brevo list ID." },
        { status: 400 },
      );
    }

    return appCorsJson(
      request,
      await listPublicChallengeAudienceContacts(listId),
    );
  } catch (error) {
    console.error("[public-challenge-audience] Brevo request failed", error);
    return appCorsJson(
      request,
      { error: "Brevo audience could not be loaded." },
      { status: 502 },
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
