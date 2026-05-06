import { NextResponse } from "next/server";
import { submitRun } from "@/lib/code/runCode";
import { parseRunReq } from "@/lib/code/api/parseRunReq";
import {checkIdeCapability} from "@/lib/access/ideCapabilityServer";
import {ensureGuestId, getActor} from "@/lib/practice/actor";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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



    const raw = await req.json();
    const body = parseRunReq(raw);
    if (process.env.NODE_ENV !== "production" && body.language === "sql") {
      console.log("[sql-run] api request", {
        datasetId: (body as any).datasetId ?? null,
        dialect: (body as any).dialect ?? null,
        resultShape: (body as any).resultShape ?? null,
        hasSchemaSql: Boolean(String((body as any).schemaSql ?? "").trim()),
        hasSeedSql: Boolean(String((body as any).seedSql ?? "").trim()),
      });
    }
    const actor0 = await getActor();
    const ensured = ensureGuestId(actor0);
    const actor = ensured.actor;
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
