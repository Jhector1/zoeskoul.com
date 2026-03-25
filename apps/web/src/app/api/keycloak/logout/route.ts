// src/app/api/keycloak/logout/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

function getAppBase(reqUrl: string) {
  // ✅ Prefer AUTH_URL in v5
  const fromEnv = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return new URL(reqUrl).origin;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("id_token_hint");

  const session = await auth();
  const fromSession = (session as any)?.idToken as string | undefined;

  const idToken = fromQuery || fromSession;
  if (!idToken) {
    return NextResponse.json({ message: "Missing id_token_hint" }, { status: 400 });
  }

  const appBase = getAppBase(req.url);

  // ✅ redirect to your app homepage (or pass a redirectTo=... if you want)
  const postLogout = new URL(appBase);
  postLogout.pathname = "/"; // keep it simple for Keycloak allow-listing

  const issuer = process.env.KEYCLOAK_ISSUER!;
  const kcLogout = new URL(`${issuer}/protocol/openid-connect/logout`);

  kcLogout.searchParams.set("id_token_hint", idToken);
  kcLogout.searchParams.set("post_logout_redirect_uri", postLogout.toString());

  // Some Keycloak setups want client_id too
  if (process.env.KEYCLOAK_CLIENT_ID) {
    kcLogout.searchParams.set("client_id", process.env.KEYCLOAK_CLIENT_ID);
  }

  return NextResponse.redirect(kcLogout.toString());
}
