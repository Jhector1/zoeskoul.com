import {
  adminCurriculumDraftOptions,
  runAdminCurriculumDraftRoute,
} from "@/lib/admin/curriculumDraftRoute";
import { NextResponse } from "next/server";
import { analyzeDraftTopic } from "@/lib/dev/curriculumDrafts/diagnostics";
import { isCurriculumDraftEditorEnabled } from "@/lib/dev/curriculumDrafts/fs";
import { loadSourceTopic } from "@/lib/dev/curriculumDrafts/sourceFs";
import { parseDraftQuery } from "@/lib/dev/curriculumDrafts/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const ref = parseDraftQuery(url.searchParams);
    const topic = await loadSourceTopic(ref);
    const diagnostics = analyzeDraftTopic({
      bundleJson: topic.bundleJson,
      messagesJson: topic.messagesJson,
    });

    return NextResponse.json({
      catalog: topic.catalog,
      subject: topic.subject,
      module: topic.module,
      topic: topic.topic,
      locale: topic.locale,
      moduleDir: topic.moduleDir,
      topicDir: topic.topicDir,
      paths: {
        source: topic.relativeSourcePath,
        bundle: "derived in memory (read-only)",
        messages: "derived in memory (read-only)",
      },
      sourceJson: topic.sourceJson,
      bundleJson: topic.bundleJson,
      messagesJson: topic.messagesJson,
      ...diagnostics,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load topic" },
      { status: 400 },
    );
  }
}

export function GET(request: Request) {
  return runAdminCurriculumDraftRoute(
    request,
    () => handleGET(request),
  );
}

export function OPTIONS(request: Request) {
  return adminCurriculumDraftOptions(request);
}
