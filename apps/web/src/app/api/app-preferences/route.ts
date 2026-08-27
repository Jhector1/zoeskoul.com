import {
  DEFAULT_APP_PREFERENCES,
  inferAppLocale,
  isAppPreferences,
  normalizeAppPreferences,
  parseAcceptLanguage,
  parseAppPreferencesPatch,
  readPreferencesCookie,
  type AppPreferences,
  type AppPreferencesResponse,
} from "@zoeskoul/preferences";

import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { prisma } from "@/lib/prisma";
import { mirrorPreferencesCookies } from "@/lib/preferences/cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inferRequestPreferences(request: Request): AppPreferences {
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-country-code");

  return {
    ...DEFAULT_APP_PREFERENCES,
    locale: inferAppLocale({
      languages: parseAcceptLanguage(
        request.headers.get("accept-language"),
      ),
      country,
    }),
  };
}

function response(
  request: Request,
  authenticated: boolean,
  preferences: AppPreferences,
  source: AppPreferencesResponse["source"],
  init?: ResponseInit,
) {
  const body: AppPreferencesResponse = {
    authenticated,
    preferences,
    source,
  };
  return mirrorPreferencesCookies(
    request,
    appCorsJson(request, body, init),
    preferences,
  );
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(request, { error: "Forbidden" }, { status: 403 });
  }

  const access = await getCurrentUserAccess();

  if (!access.authenticated || !access.user) {
    const cookiePreferences =
      readPreferencesCookie(request.headers.get("Cookie"));
    return response(
      request,
      false,
      cookiePreferences ?? inferRequestPreferences(request),
      cookiePreferences ? "cookie" : "default",
    );
  }

  const stored = await prisma.userPreferences.findUnique({
    where: { userId: access.user.id },
    select: {
      locale: true,
      theme: true,
      fontSizePx: true,
      soundEnabled: true,
    },
  });

  if (stored) {
    return response(
      request,
      true,
      normalizeAppPreferences(stored),
      "database",
    );
  }

  const cookiePreferences =
    readPreferencesCookie(request.headers.get("Cookie"));

  return response(
    request,
    true,
    cookiePreferences ?? inferRequestPreferences(request),
    cookiePreferences ? "cookie" : "default",
  );
}

export async function PATCH(request: Request) {
  if (!isAppMutationOriginAllowed(request)) {
    return appCorsJson(request, { error: "Forbidden" }, { status: 403 });
  }

  const access = await getCurrentUserAccess();
  if (!access.authenticated || !access.user) {
    return appCorsJson(request, { error: "Authentication required" }, {
      status: 401,
    });
  }

  const parsed = parseAppPreferencesPatch(await readBody(request));
  if (!parsed.success) {
    return appCorsJson(request, { error: parsed.error }, { status: 400 });
  }

  const saved = await prisma.userPreferences.upsert({
    where: { userId: access.user.id },
    create: {
      userId: access.user.id,
      ...DEFAULT_APP_PREFERENCES,
      ...parsed.data,
    },
    update: parsed.data,
    select: {
      locale: true,
      theme: true,
      fontSizePx: true,
      soundEnabled: true,
    },
  });

  return response(
    request,
    true,
    normalizeAppPreferences(saved),
    "database",
  );
}

export async function POST(request: Request) {
  if (!isAppMutationOriginAllowed(request)) {
    return appCorsJson(request, { error: "Forbidden" }, { status: 403 });
  }

  const body = await readBody(request);
  if (!isAppPreferences(body)) {
    return appCorsJson(
      request,
      { error: "A complete valid preference snapshot is required." },
      { status: 400 },
    );
  }

  const access = await getCurrentUserAccess();
  if (access.authenticated) {
    return appCorsJson(
      request,
      { error: "Authenticated preferences must use PATCH." },
      { status: 409 },
    );
  }

  return response(request, false, body, "cookie");
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
