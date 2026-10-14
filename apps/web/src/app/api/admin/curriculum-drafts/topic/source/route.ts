import {
  adminCurriculumDraftOptions,
  runAdminCurriculumDraftRoute,
} from "@/lib/admin/curriculumDraftRoute";
import { NextResponse } from "next/server";
import { isCurriculumDraftEditorEnabled } from "@/lib/dev/curriculumDrafts/fs";
import { saveSourceTopic } from "@/lib/dev/curriculumDrafts/sourceFs";
import { parseJsonBody, parseSaveSourceBody } from "@/lib/dev/curriculumDrafts/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePUT(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = parseSaveSourceBody(await parseJsonBody(request));
    const topic = await saveSourceTopic({ ref: body, sourceJson: body.sourceJson });
    return NextResponse.json({
      ok: true,
      path: topic.relativeSourcePath,
      sourceJson: topic.sourceJson,
      bundleJson: topic.bundleJson,
      messagesJson: topic.messagesJson,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save canonical topic source" },
      { status: 400 },
    );
  }
}

export function PUT(request: Request) {
  return runAdminCurriculumDraftRoute(request, () => handlePUT(request));
}

export function OPTIONS(request: Request) {
  return adminCurriculumDraftOptions(request);
}
