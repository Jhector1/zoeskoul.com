import { NextRequest, NextResponse } from "next/server";
import type { RunSessionState, StartSessionResult } from "@zoeskoul/code-contracts";
import { getActor, actorKeyOf } from "@/lib/practice/actor";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";
import { createAttachToken } from "@/lib/server/ptyAttachToken";
import { getRunnerWsBase } from "@/lib/server/runnerWsBase";
import { authorizeStudentAdminLab } from "@/lib/learning/server/authorizeStudentAdminLab";
import { parseStudentAdminLabTarget } from "@/lib/learning/server/learningAdminStudentPolicy";
import { mintStudentAdminLabGrant } from "@/lib/server/mintStudentAdminLabGrant";

export const runtime = "nodejs";

type LabResponse =
  | { ok: true; sessionId: string; state: RunSessionState; attachToken: string; wsUrl: string }
  | { ok: false; error: string };

function reject(error: string, status: number) {
  return NextResponse.json<LabResponse>({ ok: false, error }, { status });
}

/**
 * An intentionally isolated student endpoint. Never forward browser JSON to
 * /sessions/admin/start; the only payload sent to the Runner is a web-minted
 * signed, actor-bound one-time grant after checking published course access.
 * Stage 4A is OFF by default and does not alter ordinary PTY routes.
 */
export async function POST(request: NextRequest) {
  if (process.env.ZOESKOUL_LEARNING_STUDENT_ADMIN_LABS_ENABLED !== "true") {
    return reject("Administrative labs are unavailable.", 403);
  }
  const expectedOrigin = process.env.ZOESKOUL_LEARNING_WEB_ORIGIN || new URL(request.url).origin;
  if (request.headers.get("origin") !== expectedOrigin) {
    return reject("Forbidden.", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reject("Expected JSON request.", 415);
  }

  // Bound the body *while reading* (including chunked requests), before any DB
  // query or grant signing. Never buffer an arbitrarily large request in memory.
  const reader = request.body?.getReader();
  if (!reader) return reject("Invalid request.", 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let tooLarge = false;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 1024) {
        tooLarge = true;
        await reader.cancel();
        break;
      }
      chunks.push(next.value);
    }
  } catch {
    return reject("Invalid request.", 400);
  } finally {
    reader.releaseLock();
  }
  if (tooLarge) return reject("Request too large.", 413);
  const raw = Buffer.concat(chunks).toString("utf8");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return reject("Invalid JSON.", 400); }
  const target = parseStudentAdminLabTarget(parsed);
  if (!target) return reject("Invalid administrative lab target.", 400);

  try {
    const actor = await getActor();
    if (!actor.userId) return reject("Sign in required.", 401);
    const actorKey = await requireRunnerActorKey();
    if (!/^u:[0-9a-f]{64}$/.test(actorKey)) return reject("Forbidden.", 403);
    // Identity is resolved by two independent server helpers; refuse
    // a mismatched user before access checks or grant creation.
    if (actorKeyOf(actor) !== actorKey) return reject("Forbidden.", 403);
    if (!await authorizeStudentAdminLab({ actor, request, target })) {
      return reject("Administrative lab not authorized for this lesson.", 403);
    }

    const grant = mintStudentAdminLabGrant({ actorKey, target });
    const started = await runnerPost<StartSessionResult>(
      "/sessions/admin/start", actorKey, { grant },
    );
    if (!started.ok) return reject("Administrative lab unavailable.", 503);

    const attachToken = createAttachToken({ sessionId: started.sessionId, actorKey });
    const wsUrl = `${getRunnerWsBase()}/sessions/${encodeURIComponent(started.sessionId)}/ws` +
      `?token=${encodeURIComponent(attachToken)}`;
    return NextResponse.json<LabResponse>({
      ok: true,
      sessionId: started.sessionId,
      state: started.state,
      attachToken,
      wsUrl,
    });
  } catch (error) {
    if (error instanceof RunnerHttpError) {
      return reject("Administrative lab unavailable.", error.status === 403 ? 403 : 503);
    }
    // Do not leak the signed grant, root password, or Runner internals to users.
    return reject("Administrative lab unavailable.", 503);
  }
}
