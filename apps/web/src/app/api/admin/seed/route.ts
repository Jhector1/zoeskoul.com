import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { auth } from "@/lib/auth"; // ✅ Auth.js v5 default export location

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

function isAdminEmail(email?: string | null) {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return !!email && list.includes(email.toLowerCase());
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (!session || !isAdminEmail(email)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Optional: only allow in production
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ ok: false, error: "Not allowed outside production" }, { status: 403 });
  }

  try {
    const repoRoot = path.resolve(process.cwd(), "../..");
    const { stdout, stderr } = await execFileAsync(
      "pnpm",
      ["--dir", repoRoot, "--filter", "@zoeskoul/db", "db:seed"],
      {
        cwd: repoRoot,
        env: process.env,
      },
    );

    return NextResponse.json({
      ok: true,
      stdout: stdout.trim() || null,
      stderr: stderr.trim() || null,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Seed failed",
        stdout: e?.stdout?.trim?.() || null,
        stderr: e?.stderr?.trim?.() || null,
      },
      { status: 500 },
    );
  }
}
