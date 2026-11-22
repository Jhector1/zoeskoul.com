import { NextResponse } from "next/server";
import { runAdminCurriculumDraftRoute, adminCurriculumDraftOptions } from "@/lib/admin/curriculumDraftRoute";
import { loadDraftAdminQaExpected } from "@/lib/dev/curriculumDrafts/adminLabQaExercises";
import { checkDraftAdminQaRequest, readDraftAdminQaBody, rejectDraftAdminQa } from "@/lib/dev/curriculumDrafts/adminLabQaHttp";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost } from "@/lib/server/runnerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verify(request: Request) {
  const denied = checkDraftAdminQaRequest(request);
  if (denied) return denied;
  let body: unknown;
  try { body = await readDraftAdminQaBody(request); }
  catch { return rejectDraftAdminQa("Invalid Draft QA request.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).join(",") !== "key") return rejectDraftAdminQa("Expected a draft exercise key.", 400);
  let authored;
  try { authored = await loadDraftAdminQaExpected((body as {key?: unknown}).key); }
  catch { return rejectDraftAdminQa("No valid trusted filesystem expectations in this draft exercise.", 422); }
  try {
    const actorKey = await requireRunnerActorKey();
    if (!/^u:[0-9a-f]{64}$/.test(actorKey)) return rejectDraftAdminQa("Forbidden.", 403);
    const evidence = await runnerPost<{ok: boolean; passed: boolean; failedPaths: string[]}>(
      "/sessions/admin/verify-filesystem", actorKey,
      {topicSlug: authored.topicSlug, expected: authored.expected},
    );
    if (!evidence || evidence.ok !== true || typeof evidence.passed !== "boolean" ||
        !Array.isArray(evidence.failedPaths) || evidence.failedPaths.some((p) => typeof p !== "string")) {
      return rejectDraftAdminQa("Trusted filesystem evidence unavailable.", 503);
    }
    // No DB writes, student attempt records or grade awards. This is *author* QA only.
    return NextResponse.json({
      ok: evidence.passed, draftQa: true, passed: evidence.passed,
      explanation: evidence.passed
        ? "Verified authored mode/ownership expectations in the disposable administrator sandbox."
        : "The sandbox does not yet match the authored filesystem expectations.",
      attempts: null, finalized: false, gamification: null,
    }, {headers: {"Cache-Control": "no-store"}});
  } catch { return rejectDraftAdminQa("Trusted filesystem evidence unavailable.", 503); }
}
export function POST(request: Request) { return runAdminCurriculumDraftRoute(request, () => verify(request)); }
export function OPTIONS(request: Request) { return adminCurriculumDraftOptions(request); }
