import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import { isCheckoutAttemptId } from "@/lib/billing/checkoutAttempt";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
} from "@/lib/http/appCors";
import {
  readJsonSafe,
  safeSameOriginUrl,
} from "@/lib/practice/api/shared/http";
import { createTutoringCreditCheckout } from "@/lib/tutoring/tutoringCreditCheckout";
import {
  isValidTutoringMinutes,
  launchTutoringCreditPackagePresentation,
} from "@/lib/tutoring/tutoringCreditPackages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAppMutationOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const access = await getCurrentUserAccess();
  if (!access.authenticated || !access.user) {
    return appCorsJson(
      request,
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  try {
    const limited = await rateLimit(
      `tutoring-credit-checkout:${access.user.id}`,
      {
        bucket: "tutoring-credit-checkout",
        limit: 12,
        window: "1 h",
      },
    );
    if (!limited.ok) {
      return appCorsJson(
        request,
        { error: "Too many tutoring checkout attempts." },
        { status: 429 },
      );
    }
  } catch {
    return appCorsJson(
      request,
      { error: "Tutoring checkout is temporarily unavailable." },
      { status: 503 },
    );
  }

  const body = (await readJsonSafe(request)) as {
    checkoutAttemptId?: unknown;
    minutes?: unknown;
    callbackUrl?: unknown;
    uiMode?: unknown;
  } | null;

  const uiMode =
    body?.uiMode ?? "hosted";

  if (
    uiMode !== "hosted" &&
    uiMode !== "embedded"
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Invalid tutoring Checkout UI mode.",
      },
      { status: 400 },
    );
  }

  if (!isCheckoutAttemptId(body?.checkoutAttemptId)) {
    return appCorsJson(
      request,
      { error: "Invalid tutoring checkout attempt." },
      { status: 400 },
    );
  }

  if (!isValidTutoringMinutes(body?.minutes)) {
    return appCorsJson(
      request,
      {
        error: "Tutoring minutes must be whole minutes between 30 and 720.",
        packages: launchTutoringCreditPackagePresentation(),
      },
      { status: 400 },
    );
  }

  const callbackPath =
    safeSameOriginUrl(
      request,
      typeof body?.callbackUrl === "string"
        ? body.callbackUrl
        : null,
    ) ?? "/billing";

  try {
    const result = await createTutoringCreditCheckout({
      userId: access.user.id,
      checkoutAttemptId: body.checkoutAttemptId,
      minutes: body.minutes,
      uiMode,
      callbackPath,
    });

    if (result.kind === "expired") {
      return appCorsJson(
        request,
        {
          error:
            "This tutoring checkout attempt expired. Start a new checkout.",
          code: "TUTORING_CHECKOUT_EXPIRED",
          purchaseId: result.purchaseId,
        },
        { status: 409 },
      );
    }

    return appCorsJson(request, result);
  } catch (error) {
    console.error("[tutoring credit checkout]", error);
    return appCorsJson(
      request,
      { error: "Tutoring checkout could not be started." },
      { status: 500 },
    );
  }
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
