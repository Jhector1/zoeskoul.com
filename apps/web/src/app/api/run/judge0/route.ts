import { NextResponse } from "next/server";
import { submitRun } from "@/lib/code/runCode";
import { parseRunReq } from "@/lib/code/api/parseRunReq";
import {checkIdeCapability} from "@/lib/access/ideCapabilityServer";
import { actorKeyOf, ensureGuestId, getActor } from "@/lib/practice/actor";
import {
  enforceSameOriginPost,
  exceedsContentLength,
  getClientIp,
} from "@/lib/practice/api/shared/http";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/security/ratelimit";
import type { RunReq } from "@/lib/code/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RUN_REQUEST_BYTES = 2 * 1024 * 1024;

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function POST(req: Request) {
  try {
    if (!enforceSameOriginPost(req)) {
      return jsonNoStore({ ok: false, error: "Forbidden." }, 403);
    }

    if (exceedsContentLength(req, MAX_RUN_REQUEST_BYTES)) {
      return jsonNoStore(
          { ok: false, error: `Payload exceeds the ${MAX_RUN_REQUEST_BYTES} byte limit.` },
          413,
      );
    }

    const actor0 = await getActor();
    const ensured = ensureGuestId(actor0);
    const actor = ensured.actor;
    const actorKey = actorKeyOf(actor);
    const rateLimitKey = actorKey === "g:missing" ? getClientIp(req) : actorKey;

    try {
      const rl = await rateLimit(`run:${rateLimitKey}`, {
        bucket: "code-execution",
        limit: 40,
        window: "60 s",
      });

      if (!rl.ok) {
        const res = jsonNoStore(
            { ok: false, error: "Too many requests." },
            429,
        );
        const retryAfter = Math.max(1, Math.ceil((rl.resetMs - Date.now()) / 1000));
        res.headers.set("Retry-After", String(retryAfter));
        return res;
      }
    } catch {
      return jsonNoStore({ ok: false, error: "Service unavailable." }, 503);
    }

    const rawText = await req.text();
    if (!rawText.trim()) {
      return jsonNoStore({ ok: false, error: "Missing request body." }, 400);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch {
      return jsonNoStore({ ok: false, error: "Invalid JSON request body." }, 400);
    }

    const parsed = parseRunReq(raw);
    const body: RunReq =
        parsed.kind === "sql"
            ? parsed
            : {
                ...parsed,
                limits: {
                  ...(parsed.limits ?? {}),
                  enable_network: false,
                },
              };

    if (process.env.NODE_ENV !== "production" && body.language === "sql") {
      console.log("[sql-run] api request", {
        datasetId: (body as any).datasetId ?? null,
        dialect: (body as any).dialect ?? null,
        resultShape: (body as any).resultShape ?? null,
        hasSchemaSql: Boolean(String((body as any).schemaSql ?? "").trim()),
        hasSeedSql: Boolean(String((body as any).seedSql ?? "").trim()),
      });
    }

    const hasMultipleFiles =
        body.kind === "code" &&
        "files" in body &&
        Array.isArray(body.files) &&
        body.files.length > 1;

    if (hasMultipleFiles) {
      const decision = await checkIdeCapability(prisma, {
        actor,
        capability: "multi_file",
      });

      if (!decision.ok) {
        return jsonNoStore(
            {
              ok: false,
              error:
                  decision.reason === "requires_login"
                      ? "Log in to unlock multiple files."
                      : "Your plan does not include multiple files.",
            },
            decision.reason === "requires_login" ? 401 : 403,
        );
      }
    }
    const out = await submitRun(body);

    return jsonNoStore(out, out.ok ? 200 : 502);
  } catch (e: any) {
    const message = e?.message ?? "Run submission failed";
    const badRequest =
        /must be|between|integer|Invalid|too large|Request body/i.test(message);

    console.error("[/api/run] failed:", e);

    return jsonNoStore(
        { ok: false, error: message },
        badRequest ? 400 : 500,
    );
  }
}
