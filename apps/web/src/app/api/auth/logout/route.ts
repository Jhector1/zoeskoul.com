import {
  signOut,
} from "@/lib/auth";
import {
  getProductionAppOrigin,
} from "@zoeskoul/app-config";
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
    process.env.NODE_ENV === "production"
      ? getProductionAppOrigin("website")
      : req.nextUrl.origin;
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
