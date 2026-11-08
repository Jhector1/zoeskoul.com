import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// V6B1 is a closed-by-default transport bridge. It does not switch Monaco
// from the proven V5 protocol and cannot enable the runner's separate gate.
const MAX_BODY_BYTES = 512 * 1024;

type WorkerResponse = { ok: boolean; code?: string; [key: string]: unknown };

function jsonNoStore(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readBoundedJson(request: Request): Promise<unknown> {
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
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("INVALID_BODY");
  }
}

/**
 * Browser -> authorized Web actor -> internal Learning Runner -> sandbox worker.
 * The Runner independently enforces its Learning pool gate and session owner.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (process.env.ZOESKOUL_V6_FILE_PROXY_ENABLED !== "true") {
    return jsonNoStore({ ok: false, code: "NOT_FOUND" }, 404);
  }

  let actorKey: string;
  try {
    // Authenticate BEFORE reading the body or forwarding to the Runner.
    actorKey = await requireRunnerActorKey();
  } catch {
    return jsonNoStore({ ok: false, code: "UNAUTHORIZED" }, 401);
  }

  try {
    const { sessionId } = await context.params;
    if (!sessionId || sessionId.length > 128 || sessionId.includes("/")) {
      return jsonNoStore({ ok: false, code: "INVALID_SESSION" }, 400);
    }
    const payload = await readBoundedJson(request);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonNoStore({ ok: false, code: "INVALID_BODY" }, 400);
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
