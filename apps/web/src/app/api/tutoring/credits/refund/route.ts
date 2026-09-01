import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
} from "@/lib/http/appCors";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  isTutoringRefundAttemptId,
  requestTutoringCreditRefund,
  TutoringCreditRefundError,
} from "@/lib/tutoring/tutoringCreditRefund";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  refundAttemptId?: unknown;
  purchaseId?: unknown;
  minutes?: unknown;
};

export async function POST(
  request: Request,
) {
  if (
    !isAppMutationOriginAllowed(
      request,
    )
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Forbidden.",
      },
      { status: 403 },
    );
  }

  const access =
    await getCurrentUserAccess();

  if (
    !access.authenticated ||
    !access.user ||
    !access.capabilities
      .accessStudentApp
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Authentication required.",
      },
      { status: 401 },
    );
  }

  const body =
    (await request
      .json()
      .catch(
        () => null,
      )) as
      | Body
      | null;

  if (
    !body ||
    !isTutoringRefundAttemptId(
      body.refundAttemptId,
    ) ||
    typeof body.purchaseId !==
      "string" ||
    !body.purchaseId.trim() ||
    typeof body.minutes !==
      "number" ||
    !Number.isSafeInteger(
      body.minutes,
    ) ||
    body.minutes <= 0
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Invalid tutoring refund request.",
      },
      { status: 400 },
    );
  }

  try {
    const limited =
      await rateLimit(
        `tutoring-credit-refund:${access.user.id}`,
        {
          bucket:
            "tutoring-credit-refund",
          limit: 12,
          window:
            "1 h",
        },
      );

    if (!limited.ok) {
      return appCorsJson(
        request,
        {
          error:
            "Too many tutoring refund requests.",
        },
        { status: 429 },
      );
    }
  } catch {
    return appCorsJson(
      request,
      {
        error:
          "Tutoring refunds are temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  try {
    const result =
      await requestTutoringCreditRefund({
        userId:
          access.user.id,
        refundAttemptId:
          body.refundAttemptId,
        purchaseId:
          body.purchaseId
            .trim(),
        minutes:
          body.minutes,
      });

    return appCorsJson(
      request,
      result,
      { status: 202 },
    );
  } catch (error) {
    if (
      error instanceof
        TutoringCreditRefundError
    ) {
      const status =
        error.code ===
          "INVALID_REFUND"
          ? 400
          : error.code ===
              "REFUND_PURCHASE_NOT_FOUND"
            ? 404
            : error.code ===
                "REFUND_RETRY_REQUIRED"
              ? 503
              : 409;

      return appCorsJson(
        request,
        {
          error:
            error.message,
          code:
            error.code,
        },
        { status },
      );
    }

    console.error(
      "[tutoring credit refund]",
      error,
    );

    return appCorsJson(
      request,
      {
        error:
          "Tutoring refund could not be started. If Stripe already received it, reconciliation will continue automatically.",
      },
      { status: 502 },
    );
  }
}

export function OPTIONS(
  request: Request,
) {
  return appCorsPreflight(
    request,
  );
}
