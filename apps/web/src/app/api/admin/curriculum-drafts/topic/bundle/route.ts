import {
  adminCurriculumDraftOptions,
  runAdminCurriculumDraftRoute,
} from "@/lib/admin/curriculumDraftRoute";
import { NextResponse } from "next/server";
import { analyzeDraftTopic } from "@/lib/dev/curriculumDrafts/diagnostics";
import { isCurriculumDraftEditorEnabled, loadDraftTopic, resolveDraftPaths, writeDraftJsonFile } from "@/lib/dev/curriculumDrafts/fs";
import { parseJsonBody, parseSaveBundleBody } from "@/lib/dev/curriculumDrafts/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePUT(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = parseSaveBundleBody(await parseJsonBody(request));
    JSON.stringify(body.bundleJson);
    const paths = await resolveDraftPaths(body);
    const write = await writeDraftJsonFile({
      filePath: paths.bundlePath,
      value: body.bundleJson,
    });
    const loaded = await loadDraftTopic(body);
    const diagnostics = analyzeDraftTopic({ bundleJson: loaded.bundleJson, messagesJson: loaded.messagesJson });

    return NextResponse.json({ ok: true, write, ...diagnostics });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save topic bundle" },
      { status: 400 },
    );
  }
}

export function PUT(request: Request) {
  return runAdminCurriculumDraftRoute(
    request,
    () => handlePUT(request),
  );
}

export function OPTIONS(request: Request) {
  return adminCurriculumDraftOptions(request);
}
