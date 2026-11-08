import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// V6B2 remains opt-in. V5 is the active Student IDE protocol.
// Preserve the V5-sized cap for list/read/delete/mkdir requests. A V6 write
// carries canonical base64: up to 5 MiB of worker bytes expands to ~6.67 MiB.
// Keep the larger allowance bounded and *only* usable by authenticated,
// same-origin write requests; Runner independently validates file capability,
// revision and its configured byte limits.
const MAX_SMALL_BODY_BYTES = 512 * 1024;
const MAX_BODY_BYTES = 7 * 1024 * 1024;
const REAL_USER_ACTOR = /^u:[a-f0-9]{64}$/;

type WorkerResponse = { ok: boolean; code?: string; [key: string]: unknown };

function jsonNoStore(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Vary": "Cookie",
    },
  });
}

/**
 * A browser cookie is sufficient to authenticate but NOT to authorize a
 * cross-site mutation. Fail closed if the Origin is absent or differs from
 * the public app origin. APP_ORIGIN supports reverse-proxy deployments where
 * the internal request URL is not the browser-facing URL.
 */
function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  const allowed = new Set([new URL(request.url).origin]);
  const publicOrigin = process.env.APP_ORIGIN?.trim();
  if (publicOrigin) {
    try {
      const configured = new URL(publicOrigin);
      if ((configured.protocol === "https:" || configured.protocol === "http:") &&
          !configured.username && !configured.password &&
          configured.pathname === "/" && !configured.search && !configured.hash) {
        allowed.add(configured.origin);
      }
    } catch { /* Fail closed for malformed configuration. */ }
  }
  return allowed.has(origin);
}

async function readBoundedJson(request: Request): Promise<{ payload: unknown; size: number }> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (!Number.isSafeInteger(length) || length < 0) throw new Error("INVALID_BODY");
    if (length > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  }
  const body = request.body;
  if (!body) throw new Error("INVALID_BODY");

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") throw error;
    throw new Error("INVALID_BODY");
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return { payload: JSON.parse(text) as unknown, size };
  } catch {
    throw new Error("INVALID_BODY");
  }
}

/**
 * Browser -> authenticated, same-origin Web API -> Learning Runner -> worker.
 * The Runner independently checks its pool, the actor, and session lifecycle.
 * No ZoeBuild endpoint or V5 synchronization behavior is changed.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (process.env.ZOESKOUL_V6_FILE_PROXY_ENABLED !== "true") {
    return jsonNoStore({ ok: false, code: "NOT_FOUND" }, 404);
  }
  if (!hasTrustedOrigin(request)) {
    return jsonNoStore({ ok: false, code: "FORBIDDEN_ORIGIN" }, 403);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return jsonNoStore({ ok: false, code: "INVALID_CONTENT_TYPE" }, 415);
  }

  let actorKey: string;
  try {
    actorKey = await requireRunnerActorKey();
    // Shared PTY auth has a dev-only e2e actor fallback. The V6 mutation
    // protocol MUST require a real signed-in user, even in that test mode.
    if (!REAL_USER_ACTOR.test(actorKey)) throw new Error("Unauthorized");
  } catch {
    return jsonNoStore({ ok: false, code: "UNAUTHORIZED" }, 401);
  }

  try {
    const { sessionId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
      return jsonNoStore({ ok: false, code: "INVALID_SESSION" }, 400);
    }
    const { payload, size } = await readBoundedJson(request);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonNoStore({ ok: false, code: "INVALID_BODY" }, 400);
    }
    // A large request is never forwarded unless it is a V6 file write.
    // The internal Runner remains the authority for paths and file sizes.
    if (size > MAX_SMALL_BODY_BYTES &&
        (payload as { op?: unknown }).op !== "write") {
      return jsonNoStore({ ok: false, code: "BODY_TOO_LARGE" }, 413);
    }
    const result = await runnerPost<WorkerResponse>(
      `/sessions/${encodeURIComponent(sessionId)}/files/operation`,
      actorKey,
      payload,
    );
    if (!result || typeof result.ok !== "boolean") {
      return jsonNoStore({ ok: false, code: "INVALID_RUNNER_RESPONSE" }, 502);
    }
    return jsonNoStore(result, result.ok ? 200 : 502);
  } catch (error) {
    if (error instanceof RunnerHttpError) {
      const status = [400, 401, 403, 404, 409, 413, 428, 503].includes(error.status)
        ? error.status
        : 502;
      return jsonNoStore({
        ok: false,
        code: error.code ?? (status === 409 ? "CONFLICT" : "RUNNER_REJECTED"),
      }, status);
    }
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
      return jsonNoStore({ ok: false, code: "BODY_TOO_LARGE" }, 413);
    }
    if (error instanceof Error && error.message === "INVALID_BODY") {
      return jsonNoStore({ ok: false, code: "INVALID_BODY" }, 400);
    }
    return jsonNoStore({ ok: false, code: "FILE_PROXY_UNAVAILABLE" }, 503);
  }
}
