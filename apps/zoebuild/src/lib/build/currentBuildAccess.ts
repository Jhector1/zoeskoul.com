import "server-only";

import {
  cookies,
} from "next/headers";

import {
  createAuthClient,
} from "@zoeskoul/auth-client";
import type {
  BuildAccessSnapshot,
} from "@zoeskoul/build-application";

import {
  resolveZoeBuildOrigins,
} from "@/lib/appOrigins";
import {
  loadBuildAccessSnapshot,
} from "@/lib/build/buildAccessSnapshot";

async function requestCookieHeader(
  request?: Request,
): Promise<string> {
  if (request) {
    return (
      request.headers.get("cookie") ??
      ""
    );
  }

  const cookieStore =
    await cookies();

  return cookieStore.toString();
}

/**
 * Resolve ZoeBuild identity from the Web-owned canonical app-session endpoint.
 *
 * ZoeBuild does not own Auth.js providers, OAuth credentials, session signing,
 * or a second login flow. Web authenticates the browser and returns only the
 * browser-safe canonical account snapshot.
 *
 * Build authorization remains ZoeBuild-owned after identity resolution.
 */
export async function loadCurrentBuildAccessSnapshot(
  request?: Request,
): Promise<BuildAccessSnapshot> {
  const {
    websiteOrigin,
    zoebuildOrigin,
  } = resolveZoeBuildOrigins();

  const cookieHeader =
    await requestCookieHeader(request);

  const client =
    createAuthClient({
      apiOrigin: websiteOrigin,

      fetchImpl: async (
        input,
        init,
      ) => {
        const headers =
          new Headers(init?.headers);

        if (cookieHeader) {
          headers.set(
            "Cookie",
            cookieHeader,
          );
        }

        headers.set(
          "Origin",
          zoebuildOrigin,
        );

        return fetch(input, {
          ...init,
          headers,
          cache: "no-store",
        });
      },
    });

  try {
    const session =
      await client.fetchSession();

    if (!session.authenticated) {
      return loadBuildAccessSnapshot("");
    }

    return loadBuildAccessSnapshot(
      session.user.id,
    );
  } catch {
    // The Web-owned session authority is unavailable or returned an invalid
    // response. Authorization must fail closed.
    return loadBuildAccessSnapshot("");
  }
}
