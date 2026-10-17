import crypto from "node:crypto";

import {
  prisma,
} from "@zoeskoul/platform-server/prisma";

import {
  summarizeStaleCommerceCheckoutSweep,
  sweepStaleCommerceCheckouts,
} from "@/lib/commerce/commerceCheckoutReconciliationSweep";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

function authorized(
  request: Request,
) {
  const expected =
    process.env
      .ZOEBUILD_COMMERCE_SCHEDULER_SECRET
      ?.trim() ??
    "";

  const header =
    request.headers
      .get(
        "authorization",
      ) ??
    "";

  if (
    !expected ||
    !header.startsWith(
      "Bearer ",
    )
  ) {
    return false;
  }

  const actual =
    header
      .slice(
        "Bearer ".length,
      )
      .trim();

  const left =
    Buffer.from(
      expected,
    );

  const right =
    Buffer.from(
      actual,
    );

  return (
    left.length ===
      right.length &&
    crypto.timingSafeEqual(
      left,
      right,
    )
  );
}

export async function POST(
  request: Request,
) {
  if (!authorized(request)) {
    return Response.json(
      {
        error:
          "Unauthorized.",
      },
      {
        status:
          401,
      },
    );
  }

  try {
    const sweep =
      await sweepStaleCommerceCheckouts(
        prisma,
        {
          expireOpen:
            true,
        },
      );

    const summary =
      summarizeStaleCommerceCheckoutSweep(
        sweep,
      );

    const retryableFailure =
      summary.projectErrorCount >
        0 ||
      summary.orderErrorCount >
        0;

    return Response.json(
      {
        ok:
          !retryableFailure,
        ...summary,
      },
      {
        status:
          retryableFailure
            ? 503
            : 200,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "[zoebuild-commerce-reconciliation-tick] failed",
      error,
    );

    return Response.json(
      {
        error:
          "Commerce reconciliation tick failed.",
      },
      {
        status:
          500,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}
