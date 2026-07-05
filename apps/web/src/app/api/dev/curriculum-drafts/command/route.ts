import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { findRepoRoot, isCurriculumDraftEditorEnabled, subjectWithoutDraftWrapper } from "@/lib/dev/curriculumDrafts/fs";
import { parseCommandBody, parseJsonBody } from "@/lib/dev/curriculumDrafts/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function commandArgs(args: { command: string; catalog?: string; subject?: string; resume?: boolean }) {
  if (args.command === "gen:manifests") {
    return ["pnpm", ["--filter", "@zoeskoul/web", "gen:manifests"]] as const;
  }

  if (args.command === "typecheck") {
    return ["pnpm", ["--filter", "@zoeskoul/web", "typecheck"]] as const;
  }

  if (args.command === "course:check" || args.command === "course:check:resume") {
    if (!args.catalog || !args.subject) throw new Error("catalog and subject are required for course checks");
    const subjectSlug = subjectWithoutDraftWrapper(args.catalog, args.subject);
    const command = ["curr:course", "--", "check", args.catalog, subjectSlug];
    if (args.command === "course:check:resume" || args.resume) command.push("--resume");
    command.push("--draft-only");
    return ["pnpm", command] as const;
  }

  throw new Error(`Unsupported command: ${args.command}`);
}

async function runCommand(args: { command: string; argv: readonly string[]; cwd: string }) {
  return new Promise<{ exitCode: number | null; output: string }>((resolve) => {
    const child = spawn(args.command, args.argv, {
      cwd: args.cwd,
      env: process.env,
      shell: false,
    });
    let output = "";
    const append = (chunk: unknown) => {
      output += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => resolve({ exitCode: 1, output: error.message }));
    child.on("close", (exitCode) => resolve({ exitCode, output }));
  });
}

export async function POST(request: Request) {
  if (!isCurriculumDraftEditorEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = parseCommandBody(await parseJsonBody(request));
    const [command, argv] = commandArgs(body);
    const repoRoot = await findRepoRoot();
    const result = await runCommand({ command, argv, cwd: repoRoot });
    return NextResponse.json({ ok: result.exitCode === 0, command: [command, ...argv].join(" "), ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to run command" },
      { status: 400 },
    );
  }
}
