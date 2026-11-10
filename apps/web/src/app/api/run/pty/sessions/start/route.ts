import { NextRequest, NextResponse } from "next/server";
import type {
  InteractiveRunReq,
  RunSessionState,
  StartSessionResult,
} from "@zoeskoul/code-contracts";
import { getActor } from "@/lib/practice/actor";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { getRunnerWsBase } from "@/lib/server/runnerWsBase";
import { runnerPost, RunnerHttpError } from "@/lib/server/runnerClient";
import { createAttachToken } from "@/lib/server/ptyAttachToken";

type WorkspaceSyncEntry =
  | { kind?: "file"; path: string; content: string }
  | { kind: "directory"; path: string };

type ShellStartReq = Extract<InteractiveRunReq, { kind: "shell" }> & {
  files?: WorkspaceSyncEntry[];
};

type StartBrowserSessionResult =
  | {
      ok: true;
      sessionId: string;
      state: RunSessionState;
      attachToken: string;
      wsUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

function isShellRequest(body: unknown): body is ShellStartReq {
  if (!body || typeof body !== "object") return false;
  return (body as { kind?: unknown }).kind === "shell";
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    const body = (await req.json()) as InteractiveRunReq | ShellStartReq;

    if (isShellRequest(body) && !actor.userId) {
      return NextResponse.json<StartBrowserSessionResult>(
        { ok: false, error: "Sign in required for Shell Practice." },
        { status: 401 },
      );
    }

    const actorKey = await requireRunnerActorKey();

    const out = await runnerPost<StartSessionResult>(
      "/sessions/start",
      actorKey,
      body,
    );

    if (!out.ok) {
      return NextResponse.json<StartBrowserSessionResult>(out, { status: 400 });
    }

    const attachToken = createAttachToken({
      sessionId: out.sessionId,
      actorKey,
    });

    const runnerWsBase = getRunnerWsBase();
    const wsUrl =
      `${runnerWsBase}/sessions/${encodeURIComponent(out.sessionId)}/ws` +
      `?token=${encodeURIComponent(attachToken)}`;

    return NextResponse.json<StartBrowserSessionResult>({
      ok: true,
      sessionId: out.sessionId,
      state: out.state,
      attachToken,
      wsUrl,
    });
  } catch (e: any) {
    console.error("PTY start route failed", {
      message: e?.message,
      stack: e?.stack,
    });

    if (e instanceof RunnerHttpError) {
      return NextResponse.json<StartBrowserSessionResult>(
        { ok: false, error: e.message },
        { status: e.status },
      );
    }

    const status = e?.message === "Unauthorized" ? 401 : 500;
    return NextResponse.json<StartBrowserSessionResult>(
      { ok: false, error: e?.message ?? "Failed." },
      { status },
    );
  }
}
