import { NextResponse } from "next/server";

import { createStartLearningEntry } from "@/lib/learning/entry";
import { resolveLearningEntry } from "@/lib/learning/server/resolveLearningEntry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entry = await resolveLearningEntry();
    return NextResponse.json(entry, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    // Header navigation is non-critical. A database or stale-progress problem
    // must fall back to course discovery instead of crashing every page.
    console.error("[learning-entry] Could not resolve the latest lesson", error);
    return NextResponse.json(createStartLearningEntry(), {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
