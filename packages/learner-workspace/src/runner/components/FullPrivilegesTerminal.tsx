"use client";

import React from "react";
import type { TerminalChunk } from "@zoeskoul/learner-workspace/runner/runtime";
import XtermTerminal from "@zoeskoul/learner-workspace/runner/components/XtermTerminal";
import { acknowledgeDisposableCancel, disposableCloseMessage } from "./fullPrivilegesRecovery";

/** Each mount owns exactly one disposable, authenticated rootless lab.
 * This terminal deliberately does NOT share the normal Explorer workspace.
 */
export default function FullPrivilegesTerminal() {
  const [feed, setFeed] = React.useState<TerminalChunk[]>([]);
  const [status, setStatus] = React.useState<"starting" | "ready" | "error" | "closed">("starting");
  const [error, setError] = React.useState<string | null>(null);
  const socketRef = React.useRef<WebSocket | null>(null);
  const counter = React.useRef(0);
  const [attempt, setAttempt] = React.useState(0);
  const [restarting, setRestarting] = React.useState(false);
  const restartPending = React.useRef(false);
  const sessionRef = React.useRef<string | null>(null);
  const mounted = React.useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const restart = React.useCallback(async () => {
    if (restartPending.current || (status !== "closed" && status !== "error")) return;
    restartPending.current = true;
    setRestarting(true);
    try {
      const sid = sessionRef.current;
      // Cancel is acknowledged by the existing actor-bound endpoint before a
      // new grant is requested. Physical Docker cleanup remains asynchronous.
      if (sid) await acknowledgeDisposableCancel(sid);
      if (!mounted.current) return;
      sessionRef.current = null;
      const oldSocket = socketRef.current;
      if (oldSocket) {
        oldSocket.onmessage = null;
        oldSocket.onerror = null;
        oldSocket.onclose = null;
        oldSocket.close();
        socketRef.current = null;
      }
      setFeed([]);
      setError(null);
      setStatus("starting");
      setAttempt(value => value + 1);
    } catch {
      if (mounted.current) setError("Previous lab cancellation could not be confirmed. Retry or contact the operator.");
    } finally {
      restartPending.current = false;
      if (mounted.current) setRestarting(false);
    }
  }, [status]);
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
    const cancel = (sid: string) => { void acknowledgeDisposableCancel(sid).catch(() => {}); };
    // Defer initial admission so React development effect replay can dispose
    // the first mount before it sends a POST. No automatic error retry.
    void Promise.resolve().then(async () => {
      if (!live) return;
      try {
        const response = await fetch("/api/run/pty/sessions/admin/start", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moduleSlug: "zoelearning-disposable-root", topicSlug: "full-privileges" }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || typeof data.sessionId !== "string") {
          throw new Error(typeof data?.error === "string" ? data.error : "Full privileges are disabled.");
        }
        const startedSessionId: string = data.sessionId;
        sessionId = startedSessionId;
        if (!live) { cancel(startedSessionId); return; }
        sessionRef.current = startedSessionId;
        if (typeof data.wsUrl !== "string" || !/^wss?:\/\//.test(data.wsUrl)) throw new Error("Invalid lab connection URL.");
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
              else if (ev?.type === "error" && ["Session timed out from inactivity.", "Session reached its maximum lifetime."].includes(ev.message)) {
                setError(ev.message);
              } else if (ev?.type === "status" && ["completed", "canceled", "failed", "timed_out"].includes(ev.state)) {
                setError(current => current ?? disposableCloseMessage(`Session ${ev.state}`));
                setStatus("closed");
              }
            }
          } catch { /* Ignore malformed/irrelevant frames. */ }
        };
        socket.onerror = () => { if (live) { setError("Lab connection interrupted."); setStatus("error"); } };
        socket.onclose = event => {
          if (!live) return;
          setError(current => current ?? disposableCloseMessage(event.reason));
          setStatus(current => current === "error" ? current : "closed");
        };
      } catch (e) {
        if (live) {
          setError(e instanceof Error ? e.message : "Unable to start lab.");
          setStatus("error");
        }
      }
    });
    return () => {
      live = false;
      socketRef.current = null;
      socket?.close();
      if (sessionId && sessionRef.current === sessionId) {
        sessionRef.current = null;
        cancel(sessionId);
      }
    };
  }, [append, attempt]);

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
        {" "}<code>cat /workspace/.lab-root-password</code> for su - root.
        {" "}Restart creates a fresh lab and discards its files. Network access may expire before the terminal lifetime.
      </p>
      {error ? <p role="alert" className="px-3 text-xs text-rose-600">{error}</p> : null}
      <div className="min-h-0 flex-1">
        <XtermTerminal
          key={attempt}
          terminalFeed={feed}
          inputEnabled={status === "ready"}
          busy={status === "starting" || restarting}
          disabled={status === "starting" || restarting}
          lastResult={null}
          onSendData={data => send({ type: "input", data })}
          onResize={(cols, rows) => send({ type: "resize", cols, rows })}
          interactiveReady={status === "ready"}
          cwdLabel="/workspace (disposable root lab)"
          recoverState={status === "starting" ? "starting" : status === "closed" || status === "error" ? "restart_available" : "none"}
          restarting={restarting}
          onRestart={restart}
          recoverMessage={error || (status === "closed" ? disposableCloseMessage("") : null)}
        />
      </div>
    </div>
  );
}
