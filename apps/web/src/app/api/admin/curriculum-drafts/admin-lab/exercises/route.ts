import { NextResponse } from "next/server";
import { runAdminCurriculumDraftRoute, adminCurriculumDraftOptions } from "@/lib/admin/curriculumDraftRoute";
import { loadDraftAdminQaExercises } from "@/lib/dev/curriculumDrafts/adminLabQaExercises";
import { checkDraftAdminQaRequest, rejectDraftAdminQa } from "@/lib/dev/curriculumDrafts/adminLabQaHttp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(request: Request) {
  const denied = checkDraftAdminQaRequest(request, false);
  if (denied) return denied;
  const search = new URL(request.url).searchParams;
  const ref = {
    catalog: search.get("catalog"), subject: search.get("subject"),
    module: search.get("module"), topic: search.get("topic"),
  };
  try {
    const exercises = await loadDraftAdminQaExercises(ref);
    return NextResponse.json({ok: true, draftQa: true, exercises},
      {headers: {"Cache-Control": "no-store"}});
  } catch { return rejectDraftAdminQa("Approved draft is unavailable.", 403); }
}
export function GET(request: Request) { return runAdminCurriculumDraftRoute(request, () => load(request)); }
export function OPTIONS(request: Request) { return adminCurriculumDraftOptions(request); }
