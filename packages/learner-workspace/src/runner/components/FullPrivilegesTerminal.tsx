"use client";

import React from "react";
import type { TerminalChunk } from "@zoeskoul/learner-workspace/runner/runtime";
import XtermTerminal from "@zoeskoul/learner-workspace/runner/components/XtermTerminal";

/** Each mount owns exactly one disposable, authenticated rootless lab.
 * This terminal deliberately does NOT share the normal Explorer workspace.
 */
export default function FullPrivilegesTerminal() {
  const [feed, setFeed] = React.useState<TerminalChunk[]>([]);
  const [status, setStatus] = React.useState<"starting" | "ready" | "error" | "closed">("starting");
  const [error, setError] = React.useState<string | null>(null);
  const socketRef = React.useRef<WebSocket | null>(null);
  const counter = React.useRef(0);
  const append = React.useCallback((kind: TerminalChunk["kind"], data: string) => {
    if (!data) return;
    setFeed(prev => {
      const next = [...prev, { id: ++counter.current, kind, data }];
      // Bound browser memory even when an administrator command is very noisy.
      return next.length > 600 ? next.slice(-600) : next;
    });
  }, []);

  React.useEffect(() => {
    let live = true;
    let sessionId: string | null = null;
    let socket: WebSocket | null = null;
    const cancel = (sid: string) => {
      void fetch(`/api/run/pty/sessions/${encodeURIComponent(sid)}/cancel`, {
        method: "POST", credentials: "same-origin",
      }).catch(() => {});
    };
    void (async () => {
      try {
        const response = await fetch("/api/run/pty/sessions/admin/start", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moduleSlug: "zoelearning-disposable-root", topicSlug: "full-privileges" }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || typeof data.sessionId !== "string" ||
            typeof data.wsUrl !== "string") {
          throw new Error(typeof data?.error === "string" ? data.error : "Full privileges are disabled.");
        }
        const startedSessionId: string = data.sessionId;
        sessionId = startedSessionId;
        if (!live) { cancel(startedSessionId); return; }
        if (!/^wss?:\/\//.test(data.wsUrl)) throw new Error("Invalid lab connection URL.");
        socket = new WebSocket(data.wsUrl);
        socketRef.current = socket;
        socket.onmessage = event => {
          if (!live) return;
          try {
            const msg = JSON.parse(String(event.data));
            if (msg.type === "ready") { setStatus("ready"); return; }
            if (msg.type === "error") {
              setError(typeof msg.message === "string" ? msg.message : "Lab connection error.");
              setStatus("error"); return;
            }
            if (msg.type === "event") {
              const ev = msg.event;
              if (ev?.type === "stdout") append("pty", String(ev.chunk ?? ""));
              else if (ev?.type === "stderr") append("err", String(ev.chunk ?? ""));
              else if (ev?.type === "status" && ["completed", "canceled", "failed", "timed_out"].includes(ev.state)) {
                setStatus("closed");
              }
            }
          } catch { /* Ignore malformed/irrelevant frames. */ }
        };
        socket.onerror = () => { if (live) { setError("Lab connection interrupted."); setStatus("error"); } };
        socket.onclose = () => { if (live) setStatus(current => current === "error" ? current : "closed"); };
      } catch (e) {
        if (live) {
          setError(e instanceof Error ? e.message : "Unable to start lab.");
          setStatus("error");
        }
      }
    })();
    return () => {
      live = false;
      socketRef.current = null;
      socket?.close();
      if (sessionId) cancel(sessionId);
    };
  }, [append]);

  const send = React.useCallback((message: {type: string; [key: string]: unknown}) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col gap-1" data-testid="zoelearning-full-privileges-terminal">
      <p className="px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
        Disposable lab only. Normal Explorer files are not mounted here.
        Read <code>cat /workspace/.lab-student-password</code> for sudo and
        <code>cat /workspace/.lab-root-password</code> for su - root.
      </p>
      {error ? <p role="alert" className="px-3 text-xs text-rose-600">{error}</p> : null}
      <div className="min-h-0 flex-1">
        <XtermTerminal
          terminalFeed={feed}
          inputEnabled={status === "ready"}
          busy={status === "starting"}
          disabled={status !== "ready"}
          lastResult={null}
          onSendData={data => send({ type: "input", data })}
          onResize={(cols, rows) => send({ type: "resize", cols, rows })}
          interactiveReady={status === "ready"}
          cwdLabel="/workspace (disposable root lab)"
          recoverState={status === "starting" ? "starting" : status === "closed" || status === "error" ? "restart_available" : "none"}
          recoverMessage={error || (status === "closed" ? "Disposable session ended. Turn Full privileges OFF and back ON for a new session." : null)}
        />
      </div>
    </div>
  );
}
