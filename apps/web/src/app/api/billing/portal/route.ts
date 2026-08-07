
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createBillingPortalSession } from "@/lib/billing/stripeService";
import { enforceSameOriginPost } from "@/lib/practice/api/shared/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!enforceSameOriginPost(req)) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { url } = await createBillingPortalSession(userId);
  return NextResponse.json({ url });
}
