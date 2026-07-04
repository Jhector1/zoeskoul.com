import { NextResponse } from "next/server";
import { analyzeDraftTopic } from "@/lib/dev/curriculumDrafts/diagnostics";
import { isCurriculumDraftEditorEnabled, loadDraftTopic } from "@/lib/dev/curriculumDrafts/fs";
import { parseDraftQuery, parseJsonBody } from "@/lib/dev/curriculumDrafts/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const ref = parseDraftQuery(url.searchParams);
    const loaded = await loadDraftTopic(ref);
    return NextResponse.json(analyzeDraftTopic({ bundleJson: loaded.bundleJson, messagesJson: loaded.messagesJson }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to validate topic" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = await parseJsonBody(request);
    const ref = {
      catalog: String(body.catalog ?? ""),
      subject: String(body.subject ?? ""),
      module: String(body.module ?? ""),
      topic: String(body.topic ?? ""),
      locale: typeof body.locale === "string" ? body.locale : "en",
    };
    const loaded = await loadDraftTopic(ref);
    return NextResponse.json(analyzeDraftTopic({ bundleJson: loaded.bundleJson, messagesJson: loaded.messagesJson }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to validate topic" },
      { status: 400 },
    );
  }
}
