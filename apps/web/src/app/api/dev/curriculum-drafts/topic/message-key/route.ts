import { NextResponse } from "next/server";
import { analyzeDraftTopic } from "@/lib/dev/curriculumDrafts/diagnostics";
import { isCurriculumDraftEditorEnabled, loadDraftTopic, setNestedValue, writeDraftJsonFile } from "@/lib/dev/curriculumDrafts/fs";
import { parseJsonBody, parseMessageKeyBody } from "@/lib/dev/curriculumDrafts/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = parseMessageKeyBody(await parseJsonBody(request));
    const loaded = await loadDraftTopic(body);
    const messagesJson = loaded.messagesJson ?? {};
    const nextMessages = setNestedValue(messagesJson, body.keyPath, body.value);
    const write = await writeDraftJsonFile({
      filePath: loaded.messagesPath,
      value: nextMessages,
    });
    const refreshed = await loadDraftTopic(body);
    const diagnostics = analyzeDraftTopic({ bundleJson: refreshed.bundleJson, messagesJson: refreshed.messagesJson });

    return NextResponse.json({ ok: true, write, messagesJson: refreshed.messagesJson, ...diagnostics });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save message key" },
      { status: 400 },
    );
  }
}
