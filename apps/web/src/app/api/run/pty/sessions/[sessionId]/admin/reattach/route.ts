import { NextRequest, NextResponse } from "next/server";
import { getActor, actorKeyOf } from "@/lib/practice/actor";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";
import { createAttachToken } from "@/lib/server/ptyAttachToken";
import { getRunnerWsBase } from "@/lib/server/runnerWsBase";
import { authorizeStudentAdminLab } from "@/lib/learning/server/authorizeStudentAdminLab";
import { parseStudentAdminLabTarget } from "@/lib/learning/server/learningAdminStudentPolicy";

export const runtime = "nodejs";
const sessionPattern = /^sess_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const target = Object.freeze({ moduleSlug: "zoelearning-disposable-root", topicSlug: "full-privileges" });

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
function unavailable(status: number) {
  return json({ ok: false, error: "Administrative lab unavailable." }, status);
}

/** Reauthorize the existing global administrator shell; never start a lab or
 * accept a grant, actor, target, or token from browser input. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  if (process.env.ZOESKOUL_LEARNING_STUDENT_ADMIN_LABS_ENABLED !== "true") return unavailable(403);
  const origin = process.env.ZOESKOUL_LEARNING_WEB_ORIGIN;
  if (!origin || request.headers.get("origin") !== origin) return unavailable(403);
  if (request.body !== null) return unavailable(400);
  try {
    const { sessionId } = await params;
    if (typeof sessionId !== "string" || !sessionPattern.test(sessionId)) return unavailable(400);
    const actor = await getActor();
    if (!actor.userId) return unavailable(401);
    const actorKey = await requireRunnerActorKey();
    if (!/^u:[0-9a-f]{64}$/.test(actorKey) || actorKeyOf(actor) !== actorKey) return unavailable(403);
    const parsedTarget = parseStudentAdminLabTarget(target);
    if (!parsedTarget || !await authorizeStudentAdminLab({ actor, request, target: parsedTarget })) return unavailable(403);
    const allowed = await runnerPost<{ ok?: unknown; sessionId?: unknown; state?: unknown }>(
      `/sessions/${encodeURIComponent(sessionId)}/admin/reattach`, actorKey, {},
    );
    if (!allowed || allowed.ok !== true || allowed.sessionId !== sessionId ||
        (allowed.state !== "waiting_for_input" && allowed.state !== "running")) return unavailable(503);
    const base = getRunnerWsBase();
    const url = new URL(`${base}/sessions/${encodeURIComponent(sessionId)}/ws`);
    if ((url.protocol !== "wss:" && url.protocol !== "ws:") || url.username || url.password || url.search || url.hash) return unavailable(503);
    const attachToken = createAttachToken({ sessionId, actorKey });
    if (typeof attachToken !== "string" || !attachToken) return unavailable(503);
    url.searchParams.set("token", attachToken);
    return json({ ok: true, sessionId, state: allowed.state, attachToken, wsUrl: url.toString() });
  } catch (error) {
    if (error instanceof RunnerHttpError && (error.status === 403 || error.status === 404)) return unavailable(403);
    return unavailable(503);
  }
}
