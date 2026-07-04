import { NextResponse } from "next/server";
import { analyzeDraftTopic } from "@/lib/dev/curriculumDrafts/diagnostics";
import { isCurriculumDraftEditorEnabled, loadDraftTopic } from "@/lib/dev/curriculumDrafts/fs";
import { parseDraftQuery } from "@/lib/dev/curriculumDrafts/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const ref = parseDraftQuery(url.searchParams);
    const topic = await loadDraftTopic(ref);
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
        bundle: topic.relativeBundlePath,
        messages: topic.relativeMessagesPath,
      },
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
