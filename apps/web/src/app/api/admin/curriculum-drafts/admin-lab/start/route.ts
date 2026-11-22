import { NextResponse } from "next/server";
import type { RunSessionState, StartSessionResult } from "@zoeskoul/code-contracts";
import { runAdminCurriculumDraftRoute, adminCurriculumDraftOptions } from "@/lib/admin/curriculumDraftRoute";
import { loadApprovedDraftAdminLab } from "@/lib/dev/curriculumDrafts/adminLabQaPolicy";
import { checkDraftAdminQaRequest, readDraftAdminQaBody, rejectDraftAdminQa } from "@/lib/dev/curriculumDrafts/adminLabQaHttp";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { mintStudentAdminLabGrant } from "@/lib/server/mintStudentAdminLabGrant";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";
import { createAttachToken } from "@/lib/server/ptyAttachToken";
import { getRunnerWsBase } from "@/lib/server/runnerWsBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function start(request: Request) {
  const denied = checkDraftAdminQaRequest(request);
  if (denied) return denied;
  let body: unknown;
  try { body = await readDraftAdminQaBody(request, 1024); }
  catch { return rejectDraftAdminQa("Invalid draft QA request.", 400); }
  let approved;
  try { approved = await loadApprovedDraftAdminLab(body); }
  catch { return rejectDraftAdminQa("Approved canonical Course 2 draft not available.", 403); }
  try {
    // This is an admin-only route; require a REAL authenticated user actor.
    // Never permit guest, e2e or caller-selected actor keys for privileged labs.
    const actorKey = await requireRunnerActorKey();
    if (!/^u:[0-9a-f]{64}$/.test(actorKey)) return rejectDraftAdminQa("Forbidden.", 403);
    // Reuse the existing one-time signed grant; the Runner cannot distinguish
    // the published/draft caller, but Web routes enforce those policies separately.
    const grant = mintStudentAdminLabGrant({actorKey, target: approved.target});
    const started = await runnerPost<StartSessionResult>(
      "/sessions/admin/start", actorKey, {grant},
    );
    if (!started.ok) return rejectDraftAdminQa("Administrative lab unavailable.", 503);
    const attachToken = createAttachToken({sessionId: started.sessionId, actorKey});
    const wsUrl = `${getRunnerWsBase()}/sessions/${encodeURIComponent(started.sessionId)}/ws` +
      `?token=${encodeURIComponent(attachToken)}`;
    return NextResponse.json<{
      ok: true; sessionId: string; state: RunSessionState; wsUrl: string; draftQa: true;
    }>({ok: true, sessionId: started.sessionId, state: started.state, wsUrl, draftQa: true},
    {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    if (error instanceof RunnerHttpError) {
      return rejectDraftAdminQa("Administrative lab unavailable.", error.status === 403 ? 403 : 503);
    }
    return rejectDraftAdminQa("Administrative lab unavailable.", 503);
  }
}

export function POST(request: Request) {
  return runAdminCurriculumDraftRoute(request, () => start(request));
}
export function OPTIONS(request: Request) { return adminCurriculumDraftOptions(request); }
