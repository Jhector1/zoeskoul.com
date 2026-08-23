import {
  adminCurriculumDraftOptions,
  runAdminCurriculumDraftRoute,
} from "@/lib/admin/curriculumDraftRoute";
import { NextResponse } from "next/server";
import { backupDraftSubject, isCurriculumDraftEditorEnabled } from "@/lib/dev/curriculumDrafts/fs";
import { parseBackupBody, parseJsonBody } from "@/lib/dev/curriculumDrafts/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePOST(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = parseBackupBody(await parseJsonBody(request));
    const backup = await backupDraftSubject(body);
    return NextResponse.json({ ok: true, backup });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to back up curriculum draft" },
      { status: 400 },
    );
  }
}

export function POST(request: Request) {
  return runAdminCurriculumDraftRoute(
    request,
    () => handlePOST(request),
  );
}

export function OPTIONS(request: Request) {
  return adminCurriculumDraftOptions(request);
}
