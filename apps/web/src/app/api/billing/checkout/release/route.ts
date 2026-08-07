
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { isCheckoutAttemptId } from "@/lib/billing/checkoutAttempt";
import { releaseBillingCheckoutReservation } from "@/lib/billing/billingCheckoutReservation";
import {
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(req: Request) {
  if (!enforceSameOriginPost(req)) {
    return NextResponse.json({ ok: false, message: "Forbidden." }, { status: 403 });
  }
  if (exceedsContentLength(req, 4 * 1024)) {
    return NextResponse.json(
      { ok: false, message: "Request body is too large." },
      { status: 413 },
    );
  }

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = asRecord(await readJsonSafe(req));
  const checkoutAttemptId = body?.checkoutAttemptId;
  if (!isCheckoutAttemptId(checkoutAttemptId)) {
    return NextResponse.json(
      { ok: false, message: "Invalid checkout attempt." },
      { status: 400 },
    );
  }

  const released = await releaseBillingCheckoutReservation(
    userId,
    checkoutAttemptId,
  );

  return NextResponse.json({ ok: true, released });
}
