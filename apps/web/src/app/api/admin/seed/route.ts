import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const denied = await requireAdmin(request);
  if (denied) return denied;

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
