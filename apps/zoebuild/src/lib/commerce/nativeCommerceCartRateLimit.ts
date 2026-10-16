import "server-only";

import {
  createHash,
} from "node:crypto";

import {
  getClientIp,
} from "@zoeskoul/platform-server/http";
import {
  rateLimit,
} from "@zoeskoul/platform-server/security/ratelimit";

export type NativeCommerceCartRateLimitResult =
  | Readonly<{
      ok: true;
    }>
  | Readonly<{
      ok: false;
      kind:
        | "limited"
        | "unavailable";
      retryAfterSeconds?:
        number;
    }>;

function hashClientIdentity(
  request: Request,
) {
  return createHash(
    "sha256",
  )
    .update(
      getClientIp(
        request,
      ),
      "utf8",
    )
    .digest(
      "hex",
    )
    .slice(
      0,
      32,
    );
}

export async function enforceNativeCommerceCartRateLimit(
  request: Request,
  input:
    Readonly<{
      buildProjectId:
        string;
      scope:
        string;
    }>,
): Promise<
  NativeCommerceCartRateLimitResult
> {
  const projectId =
    input.buildProjectId.trim();

  const scope =
    input.scope.trim();

  if (
    !projectId ||
    !scope
  ) {
    return {
      ok: false,
      kind:
        "unavailable",
    };
  }

  const clientIdentity =
    hashClientIdentity(
      request,
    );

  const limited =
    await rateLimit(
      `zoebuild-commerce-cart:${projectId}:${scope}:${clientIdentity}`,
      {
        bucket:
          "zoebuild-commerce-cart",
        limit:
          120,
        window:
          "1 m",
      },
    ).catch(
      (error) => {
        console.error(
          "[ZoeBuild commerce cart] rate limit unavailable",
          {
            buildProjectId:
              projectId,
            scope,
            error,
          },
        );

        return null;
      },
    );

  if (!limited) {
    return {
      ok: false,
      kind:
        "unavailable",
    };
  }

  if (!limited.ok) {
    return {
      ok: false,
      kind:
        "limited",
      retryAfterSeconds:
        60,
    };
  }

  return {
    ok: true,
  };
}
