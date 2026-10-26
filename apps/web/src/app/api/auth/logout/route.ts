import {
  signOut,
} from "@/lib/auth";
import { revokeUserBuildSessions } from "@/lib/auth/buildHandoffStore";
import { resolveLogoutWebsiteOrigin } from "./logoutWebsiteOrigin";
import {
  buildKeycloakEndSessionUrl,
  readKeycloakIdToken,
  resolveLogoutProvider,
  resolveLogoutRedirect,
} from "@/lib/auth/logout";
import { getToken } from "next-auth/jwt";
import {
  type NextRequest,
  NextResponse,
} from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const websiteOrigin =
    resolveLogoutWebsiteOrigin({
      requestOrigin: req.nextUrl.origin,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
  const postLogoutRedirect =
    resolveLogoutRedirect({
      rawRedirect:
        req.nextUrl.searchParams.get(
          "postLogoutRedirect",
        ),
      baseUrl: websiteOrigin,
      locale:
        req.nextUrl.searchParams.get("locale"),
      includeLocalApps:
        process.env.NODE_ENV !== "production",
    });
  const secret =
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;
  let token: unknown = null;

  if (secret) {
    try {
      token = await getToken({
        req,
        secret,
      });
    } catch {
      // A malformed or stale JWT must not prevent local session cleanup.
    }
  }

  const provider =
    resolveLogoutProvider(token);
  const idToken =
    readKeycloakIdToken(token);

  // Logout must revoke all outstanding builder sessions before clearing the Web cookie.
  const userId = token && typeof token === "object"
    ? ("uid" in token && typeof token.uid === "string" ? token.uid
      : "sub" in token && typeof token.sub === "string" ? token.sub : null)
    : null;
  if (userId && process.env.ZOESKOUL_BUILD_HANDOFF_SECRET) {
    try { await revokeUserBuildSessions(userId); }
    catch { return new Response("Session revocation unavailable", { status: 503 }); }
  }

  // Auth.js owns its cookie names and attributes. Its server action expires
  // the exact session cookie before any optional provider redirect occurs.
  await signOut({
    redirect: false,
    redirectTo: postLogoutRedirect,
  });

  const keycloakLogout =
    provider === "keycloak"
      ? buildKeycloakEndSessionUrl({
          issuer:
            process.env.KEYCLOAK_ISSUER,
          clientId:
            process.env.KEYCLOAK_CLIENT_ID,
          postLogoutRedirect,
          idToken,
        })
      : null;
  const response = NextResponse.redirect(
    keycloakLogout ??
      postLogoutRedirect,
  );

  response.headers.set(
    "Cache-Control",
    "no-store",
  );

  return response;
}
