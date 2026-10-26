import "server-only";

import { cookies } from "next/headers";
import type { BuildAccessSnapshot } from "@zoeskoul/build-application";
import { EMPTY_SESSION, readBuilderSession, readBuilderSessionStatus, SESSION_COOKIE } from "@/lib/auth/buildHandoff";
import { loadBuildAccessSnapshot } from "@/lib/build/buildAccessSnapshot";

/** ZoeBuild consumes a Web-validated, revocable identity; it never reads Web Auth.js cookies. */
export async function loadCurrentBuildAccessSnapshot(
  request?: Request,
  options?: Readonly<{ requireAuthority?: boolean }>,
): Promise<BuildAccessSnapshot> {
  const cookieHeader = request?.headers.get("cookie");
  let token: string | undefined;
  if (request) {
    // Use the server cookie parser rather than substring matching.
    const { NextRequest } = await import("next/server");
    token = new NextRequest("https://zoebuild.invalid/", {
      headers: { cookie: cookieHeader || "" },
    }).cookies.get(SESSION_COOKIE)?.value;
  } else {
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  }
  // Financial read routes must not report 401 when central auth is actually 503.
  // They also must never trust a cached/stale identity during an outage.
  if (options?.requireAuthority) {
    const checked = await readBuilderSessionStatus(token);
    if (checked.kind === "unavailable") throw new Error("BUILDER_SESSION_AUTHORITY_UNAVAILABLE");
    const session = checked.kind === "authenticated" ? checked.session : EMPTY_SESSION;
    return loadBuildAccessSnapshot(session.authenticated ? session.user.id : "");
  }
  const session = await readBuilderSession(token);
  return loadBuildAccessSnapshot(session.authenticated ? session.user.id : "");
}
