import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { lstatSync, realpathSync } from "node:fs";
import { getActor, actorKeyOf } from "@/lib/practice/actor";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { authorizeStudentAdminLab } from "@/lib/learning/server/authorizeStudentAdminLab";
import { STUDENT_FULL_PRIVILEGES_TARGET } from "@/lib/learning/server/learningAdminStudentPolicy";
import { createStudentAdminGrantPayload } from "@/lib/server/learningAdminGrantPayload";
import { unifiedPilotConfig, pilotOrigin } from "@/lib/learning/server/unifiedLinuxPilotConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const reject = (reason: string, status: number) => reply({ ok: false, reason }, status);

async function readBounded(request: NextRequest): Promise<Buffer | null> {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 131_072) { await reader.cancel(); return null; }
            chunks.push(part.value);
        }
        return Buffer.concat(chunks);
    } catch { return null; }
    finally { reader.releaseLock(); }
}

/** Private Unix socket, so server-to-server credentials are never sent to a
 * TCP listener. Bound response bytes and wall time. No redirects or retries. */
function forward(socketPath: string, raw: Buffer, headers: Record<string, string>): Promise<{status: number; text: string}> {
    const st = lstatSync(socketPath);
    if (!st.isSocket() || st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o600 || realpathSync(socketPath) !== socketPath)
        throw Error("UNIFIED_SOCKET_UNAVAILABLE");
    return new Promise((resolve, rejectRequest) => {
        const req = httpRequest({ socketPath, path: "/sessions/unified", method: "POST", headers, agent: false }, res => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size > 524_288) { res.destroy(Error("UNIFIED_RESPONSE_LIMIT")); return; }
                chunks.push(chunk);
            });
            res.once("end", () => {
                const status = res.statusCode;
                if (!res.complete || !status || (status !== 200 && (status < 400 || status > 599)))
                    rejectRequest(Error("UNIFIED_RESPONSE_INVALID"));
                else resolve({ status, text: Buffer.concat(chunks).toString("utf8") });
            });
            res.once("error", rejectRequest);
            res.once("aborted", () => rejectRequest(Error("UNIFIED_RESPONSE_ABORTED")));
        });
        const timer = setTimeout(() => req.destroy(Error("UNIFIED_REQUEST_TIMEOUT")), 30_000);
        req.once("error", rejectRequest);
        // Wait for the response, not merely request-body flush.
        req.once("close", () => clearTimeout(timer));
        req.end(raw);
    });
}

/** Real ZoeLearning authentication; loopback-only disposable developer pilot.
 * No client-supplied actor, grant, scope or policy can become authority.
 * Do not register this bridge for a normal Runner or production deployment. */
export async function POST(request: NextRequest) {
    const config = unifiedPilotConfig();
    if (!config?.actor) return reject("UNIFIED_PILOT_DISABLED", 403);
    if (request.nextUrl.origin !== pilotOrigin || request.headers.get("host") !== "localhost:3000" ||
        request.headers.get("origin") !== pilotOrigin) return reject("UNIFIED_ORIGIN_FORBIDDEN", 403);
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) return reject("UNIFIED_CONTENT_TYPE_INVALID", 415);
    const raw = await readBounded(request);
    if (!raw) return reject("UNIFIED_BODY_LIMIT", 413);
    let body: Record<string, unknown>;
    try {
        body = JSON.parse(raw.toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            !["status", "open", "terminal", "run", "attach", "shellExit", "transfer", "end", "workspace"].includes(String(body.action)) ||
            Object.keys(body).some(k => !["action", "windowId", "environmentId", "windowGeneration", "terminalId", "previousWindowId", "confirmed", "intent", ...(body.action === "run" ? ["path", "expectedRevision"] : []), ...(body.action === "workspace" ? ["operation", "path", ...(body.operation === "update" ? ["text", "expectedRevision"] : ["move", "moveDirectory"].includes(String(body.operation)) ? ["destinationPath", "expectedRevision"] : body.operation === "trashDirectory" ? ["expectedRevision"] : body.operation === "restoreDirectory" ? ["trashId"] : body.operation === "delete" ? ["expectedRevision"] : body.operation === "create" ? ["text"] : body.operation === "createBinary" ? ["data", "sizeBytes"] : [])] : [])].includes(k))) return reject("UNIFIED_REQUEST_INVALID", 400);
    } catch { return reject(raw.length > 2048 ? "UNIFIED_BODY_LIMIT" : "UNIFIED_REQUEST_INVALID", raw.length > 2048 ? 413 : 400); }
    if (raw.length > 2048 && (body.action !== "workspace" || !["create", "createBinary", "update"].includes(String(body.operation)))) return reject("UNIFIED_BODY_LIMIT", 413);
    if (body.action === "workspace" && (body.operation === "create" || body.operation === "update") && (typeof body.text !== "string" || body.text.includes("\0") || Buffer.byteLength(body.text) > 32_768 || Buffer.from(body.text).toString("utf8") !== body.text)) return reject("UNIFIED_REQUEST_INVALID", 400);
    if (body.action === "workspace" && body.operation === "createBinary" &&
        (typeof body.data !== "string" || typeof body.sizeBytes !== "number" || !Number.isSafeInteger(body.sizeBytes) || body.sizeBytes < 0 || body.sizeBytes > 32_768 ||
         body.data.length !== Math.ceil(body.sizeBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.data) ||
         Buffer.from(body.data, "base64").length !== body.sizeBytes || Buffer.from(body.data, "base64").toString("base64") !== body.data)) return reject("UNIFIED_REQUEST_INVALID", 400);
    if (body.action === "workspace" && ["update", "move", "delete", "moveDirectory", "trashDirectory"].includes(String(body.operation)) && (typeof body.expectedRevision !== "string" || body.expectedRevision.length !== 71 || !/^sha256:[a-f0-9]{64}$/.test(body.expectedRevision))) return reject("UNIFIED_REQUEST_INVALID", 400);
    if (body.action === "workspace" && ["move", "moveDirectory"].includes(String(body.operation)) && (typeof body.destinationPath !== "string" || body.destinationPath.length < 1 || body.destinationPath.length > 128 || body.destinationPath.split("/").length > 8 || !body.destinationPath.split("/").every(p => /^[A-Za-z0-9_][A-Za-z0-9_. -]{0,63}$/.test(p) && !["node_modules", "__pycache__"].includes(p)) || body.destinationPath === body.path || (body.operation === "moveDirectory" && body.destinationPath.startsWith(String(body.path) + "/")))) return reject("UNIFIED_REQUEST_INVALID", 400);
    if (body.action === "workspace" && body.operation === "restoreDirectory" && (typeof body.trashId !== "string" || !/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(body.trashId))) return reject("UNIFIED_REQUEST_INVALID", 400);
    if (body.action === "run" && (Object.keys(body).length !== 6 || !["action", "windowId", "environmentId", "windowGeneration", "path", "expectedRevision"].every(k => Object.prototype.hasOwnProperty.call(body,k)) || typeof body.path !== "string" || /[\x00-\x1f\x7f]/.test(body.path) || body.path.length > 128 || !body.path.endsWith(".py") || body.path.split("/").length > 8 || !body.path.split("/").every(p => /^[A-Za-z0-9_][A-Za-z0-9_. -]{0,63}$/.test(p) && !["node_modules", "__pycache__"].includes(p)) || typeof body.expectedRevision !== "string" || body.expectedRevision.length !== 71 || !/^sha256:[a-f0-9]{64}$/.test(body.expectedRevision))) return reject("UNIFIED_REQUEST_INVALID", 400);
    try {
        const actor = await getActor();
        if (!actor.userId) return reject("UNIFIED_AUTHENTICATION_REQUIRED", 401);
        const actorKey = await requireRunnerActorKey();
        if (actorKey !== actorKeyOf(actor) || actorKey !== config.actor) return reject("UNIFIED_ADMISSION_FORBIDDEN", 403);
        if (!await authorizeStudentAdminLab({ actor, request, target: STUDENT_FULL_PRIVILEGES_TARGET })) return reject("UNIFIED_ADMISSION_FORBIDDEN", 403);
        // Dedicated ephemeral secret; never use or expose the shared Runner's grant secret.
        const mint = () => createStudentAdminGrantPayload({ actorKey, target: STUDENT_FULL_PRIVILEGES_TARGET,
            secret: config.grant, nowMs: Date.now(), nonce: randomBytes(16).toString("hex") });
        const response = await forward(config.socketPath, raw, {
            "Content-Type": "application/json", "Content-Length": String(raw.length), "Origin": pilotOrigin,
            "Host": "unified-pilot", "Authorization": "Bearer " + config.bridge, "X-Actor-Key": actorKey,
            "X-Unified-Auth-Grant": mint(), ...(body.action === "open" ? { "X-Unified-Open-Grant": mint() } : {}),
        });
        // The internal adapter returns only its defined response projection.
        // Bound the upstream response, and never return raw error text.
        const result = JSON.parse(response.text);
        if (!result || typeof result !== "object" || typeof result.ok !== "boolean") return reject("UNIFIED_REQUEST_UNAVAILABLE", 503);
        return reply(result, response.status);
    } catch { return reject("UNIFIED_REQUEST_UNAVAILABLE", 503); }
}
