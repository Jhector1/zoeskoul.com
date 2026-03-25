// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------------------- helpers -------------------------------- */

function harden(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  res.headers.set("Content-Security-Policy", "default-src 'none'");
  res.headers.set("Vary", "Cookie");
  return res;
}

function json(data: any, status = 200) {
  return harden(NextResponse.json(data, { status }));
}

function enforceSameOrigin(req: Request) {
  if (process.env.NODE_ENV !== "production") return true;
  const allowed = process.env.APP_ORIGIN;
  if (!allowed) return false;

  const origin = req.headers.get("origin");
  if (origin) return origin === allowed;

  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === allowed;
  } catch {
    return false;
  }
}

function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Optional: restrict to your CDN
function isAllowedImageHost(url: string) {
  const allow = (process.env.ALLOWED_AVATAR_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  if (!allow.length) return true; // no restriction configured
  try {
    return allow.includes(new URL(url).host);
  } catch {
    return false;
  }
}

const UpdateProfileSchema = z.object({
  name: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => s.length > 0, "Display name is required.")
      .refine((s) => s.length <= 60, "Display name must be 60 characters or fewer."),
  image: z
      .union([z.string(), z.null()])
      .transform((v) => {
        if (v === null) return null;
        const s = String(v).trim();
        return s.length ? s : null;
      })
      .refine((v) => v === null || (v.length <= 400 && isHttpUrl(v)), "Avatar must be a valid http(s) URL.")
      .refine((v) => v === null || isAllowedImageHost(v), "Avatar host is not allowed."),
});

async function requireUser() {
  const session = await auth();
  // Prefer id if available
  const userId = (session?.user as any)?.id ?? null;
  const email = session?.user?.email ?? null;

  if (!session || (!userId && !email)) return { user: null };

  const user = await prisma.user.findUnique({
    where: userId ? { id: userId } : { email: email! },
    select: { id: true, name: true, email: true, image: true },
  });

  return { user };
}

/* -------------------------------- handlers -------------------------------- */

export async function GET() {
  const { user } = await requireUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  return json({ user });
}

export async function PUT(req: Request) {
  if (!enforceSameOrigin(req)) return json({ error: "Forbidden" }, 403);

  const { user } = await requireUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  // rate limit per user
  try {
    const rl = await rateLimit(`profile:${user.id}`);
    if (!rl.ok) {
      const res = json({ error: "Too many requests" }, 429);
      const retryAfter = Math.max(1, Math.ceil((rl.resetMs - Date.now()) / 1000));
      res.headers.set("Retry-After", String(retryAfter));
      return res;
    }
  } catch {
    return json({ error: "Service unavailable" }, 503);
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return json({ error: "Unsupported content-type" }, 415);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.flatten() }, 400);
  }

  const { name, image } = parsed.data;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name, image },
    select: { id: true, name: true, email: true, image: true },
  });

  return json({ user: updated });
}