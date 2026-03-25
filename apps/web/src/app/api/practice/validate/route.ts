import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/security/ratelimit";

import { BodySchema } from "@/lib/practice/api/validate/schemas";
import { buildPracticeValidateContext } from "@/lib/practice/api/validate/context";
import { handlePracticeValidate } from "@/lib/practice/api/validate/handler";
import {
  enforceSameOriginPost,
  getClientIp,
  jsonApiResponse,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  if (!enforceSameOriginPost(req)) {
    return jsonApiResponse({
      requestId,
      message: "Forbidden.",
      status: 403,
    });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return jsonApiResponse({
      requestId,
      message: "Unsupported content-type.",
      status: 415,
    });
  }

  try {
    const ip = getClientIp(req);
    const rl = await rateLimit(`validate:${ip}`);

    if (!rl.ok) {
      const res = jsonApiResponse({
        requestId,
        message: "Too many requests.",
        status: 429,
      });

      const retryAfter = Math.max(1, Math.ceil((rl.resetMs - Date.now()) / 1000));
      res.headers.set("Retry-After", String(retryAfter));
      return res;
    }
  } catch {
    return jsonApiResponse({
      requestId,
      message: "Service unavailable.",
      status: 503,
    });
  }

  const raw = await readJsonSafe(req);
  const parsed = BodySchema.safeParse(raw);

  if (!parsed.success) {
    return jsonApiResponse({
      requestId,
      message: "Invalid body.",
      status: 400,
      extra: { issues: parsed.error.issues },
    });
  }

  const prep = await buildPracticeValidateContext({
    prisma,
    req,
    requestId,
    body: parsed.data,
  });

  if (prep.kind === "res") {
    return prep.res;
  }

  return handlePracticeValidate(prep.ctx);
}