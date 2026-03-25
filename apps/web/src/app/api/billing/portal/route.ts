// src/app/api/billing/portal/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createBillingPortalSession } from "@/lib/billing/stripeService";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { url } = await createBillingPortalSession(userId);
  return NextResponse.json({ url });
}
