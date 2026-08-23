import {
  adminCurriculumDraftOptions,
  runAdminCurriculumDraftRoute,
} from "@/lib/admin/curriculumDraftRoute";
import { NextResponse } from "next/server";
import { isCurriculumDraftEditorEnabled, listDraftsWithDebug } from "@/lib/dev/curriculumDrafts/fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const locale = url.searchParams.get("locale") || "en";
    return NextResponse.json(await listDraftsWithDebug(locale));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to list curriculum drafts" },
      { status: 500 },
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
