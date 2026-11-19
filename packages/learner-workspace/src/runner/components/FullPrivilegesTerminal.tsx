"use client";

import React from "react";
import type { TerminalChunk } from "@zoeskoul/learner-workspace/runner/runtime";
import XtermTerminal from "@zoeskoul/learner-workspace/runner/components/XtermTerminal";
import { acknowledgeDisposableCancel, disposableCloseMessage } from "./fullPrivilegesRecovery";
import { classifySequence, heartbeatDeadlineMs, heartbeatIntervalMs, ReattachRejected, reconnectDelaysMs,
  requestAdminReattach, stableConnectionMs, terminalCloseIsFinal, terminalSessionEnded,
  transportTimeoutMs, validatedSocketUrl } from "./fullPrivilegesReconnect";

/** Each mount owns exactly one disposable, authenticated rootless lab.
 * This terminal deliberately does NOT share the normal Explorer workspace.
 */
export default function FullPrivilegesTerminal() {
  const [feed, setFeed] = React.useState<TerminalChunk[]>([]);
  const [status, setStatus] = React.useState<"starting" | "ready" | "reconnecting" | "error" | "closed">("starting");
  const [error, setError] = React.useState<string | null>(null);
  const [historyGap, setHistoryGap] = React.useState(false);
  const inputReady = React.useRef(false);
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
      inputReady.current = false;
      setHistoryGap(false);
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
    let lastUrl = "";
    let socket: WebSocket | null = null;
    let ended = false;
    let supported = false;
    let retries = 0;
    let lastSeq = 0;
    let readyAt = 0;
    let lastPong = 0;
    let pending: ReturnType<typeof setTimeout> | undefined;
    let handshake: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let request: AbortController | undefined;
    const cancel = (sid: string) => { void acknowledgeDisposableCancel(sid).catch(() => {}); };
    const current = (ws: WebSocket) => live && !ended && socket === ws;
    function clearTransport() {
      inputReady.current = false;
      clearTimeout(handshake); clearInterval(heartbeat);
      handshake = undefined; heartbeat = undefined;
    }
    function finish(message: string, state: "closed" | "error" = "closed") {
      if (!live || ended) return;
      ended = true;
      clearTransport(); clearTimeout(pending); request?.abort();
      socket?.close();
      setError(message); setStatus(state);
    }
    function markReady(ws: WebSocket, confirmedProtocol: boolean) {
      if (!current(ws)) return;
      clearTimeout(handshake);
      inputReady.current = true;
      readyAt = Date.now();
      setError(null); setStatus("ready");
      if (!confirmedProtocol || heartbeat !== undefined) return;
      lastPong = Date.now();
      heartbeat = setInterval(() => {
        if (!current(ws) || ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastPong >= heartbeatDeadlineMs) { ws.close(); return; }
        try { ws.send(JSON.stringify({ type: "ping" })); } catch { ws.close(); }
      }, heartbeatIntervalMs);
    }
    function reconnect() {
      if (!live || ended || !sessionId) return;
      clearTransport();
      if (readyAt && Date.now() - readyAt >= stableConnectionMs) retries = 0;
      readyAt = 0;
      if (!supported || retries >= reconnectDelaysMs.length) {
        finish("Lab connection interrupted. Restart discards the previous lab and creates a new one.", "error");
        return;
      }
      const sid = sessionId;
      setError("Connection interrupted. Reconnecting to the existing lab…"); setStatus("reconnecting");
      const delay = reconnectDelaysMs[retries++];
      pending = setTimeout(async () => {
        pending = undefined;
        if (!live || ended) return;
        const controller = new AbortController(); request = controller;
        const deadline = setTimeout(() => controller.abort(), transportTimeoutMs);
        try {
          const url = await requestAdminReattach(sid, lastUrl, controller.signal);
          if (!live || ended) return;
          if (controller.signal.aborted) throw new Error("Lab reconnection timed out.");
          attach(url, true);
        } catch (error) {
          if (!live || ended) return;
          if (error instanceof ReattachRejected) finish("The existing lab is no longer available for reconnection.");
          else reconnect();
        } finally {
          clearTimeout(deadline);
          if (request === controller) request = undefined;
        }
      }, delay);
    }
    function attach(url: string, reattachment: boolean) {
      lastUrl = url;
      const ws = new WebSocket(url);
      socket = ws; socketRef.current = ws;
      let sawReady = false;
      handshake = setTimeout(() => { if (current(ws)) ws.close(); }, transportTimeoutMs);
      ws.onmessage = event => {
        if (!current(ws)) return;
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === "ready") {
            if (msg.sessionId !== sessionId || terminalSessionEnded(msg.state)) { finish(disposableCloseMessage(`Session ${msg.state}`)); return; }
            sawReady = true;
            // Compatibility: a previous deployed Runner has no replay marker.
            // Automatic reconnect/heartbeat only activates after the new marker.
            if (!reattachment) markReady(ws, false);
            return;
          }
          if (msg.type === "admin_replay_complete") {
            if (!sawReady || msg.sessionId !== sessionId || msg.seq !== lastSeq) { finish("Lab replay could not be verified.", "error"); return; }
            supported = true;
            markReady(ws, true);
            return;
          }
          if (msg.type === "pong") { lastPong = Date.now(); return; }
          if (msg.type === "error") { finish("Lab connection error.", "error"); return; }
          if (msg.type !== "event" || !sawReady) return;
          const ev = msg.event;
          const sequence = classifySequence(lastSeq, ev?.seq);
          if (sequence === "duplicate") return;
          if (sequence === "invalid") { finish("Lab event sequence could not be verified.", "error"); return; }
          if (sequence === "gap") setHistoryGap(true);
          lastSeq = ev.seq;
          if (ev.type === "stdout") append("pty", String(ev.chunk ?? ""));
          else if (ev.type === "stderr") append("err", String(ev.chunk ?? ""));
          else if (ev.type === "error" && ["Session timed out from inactivity.", "Session reached its maximum lifetime."].includes(ev.message)) {
            finish(ev.message);
          } else if (ev.type === "status" && terminalSessionEnded(ev.state)) {
            finish(disposableCloseMessage(`Session ${ev.state}`));
          }
        } catch { /* Ignore malformed frames; a missing sequence is detected on replay. */ }
      };
      ws.onerror = () => { if (current(ws)) ws.close(); };
      ws.onclose = event => {
        if (!current(ws)) return;
        clearTransport(); socketRef.current = null; socket = null;
        if (terminalCloseIsFinal(event.code, event.reason)) finish(disposableCloseMessage(event.reason));
        else reconnect();
      };
    }
    // Defer initial admission so React development effect replay can dispose
    // the first mount before it sends a POST. Do not retry initial admission.
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
        const sid: string = data.sessionId;
        sessionId = sid;
        if (!live) { cancel(sid); return; }
        sessionRef.current = sid;
        attach(validatedSocketUrl(data.wsUrl), false);
      } catch (error) {
        if (live) finish(error instanceof Error ? error.message : "Unable to start lab.", "error");
      }
    });
    return () => {
      live = false;
      clearTransport(); clearTimeout(pending); request?.abort();
      socketRef.current = null;
      socket?.close();
      if (sessionId && sessionRef.current === sessionId) {
        sessionRef.current = null;
        cancel(sessionId);
      }
    };
  }, [append, attempt]);

  const send = React.useCallback((message: {type: string; [key: string]: unknown}) => {
    if (inputReady.current && socketRef.current?.readyState === WebSocket.OPEN) {
      try { socketRef.current.send(JSON.stringify(message)); } catch { /* Never buffer or replay input. */ }
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
      {historyGap ? <p role="status" className="px-3 text-xs text-amber-600">Some terminal output was no longer retained by the Runner. The transcript may be incomplete.</p> : null}
      {error ? <p role="alert" className="px-3 text-xs text-rose-600">{error}</p> : null}
      <div className="min-h-0 flex-1">
        <XtermTerminal
          key={attempt}
          terminalFeed={feed}
          inputEnabled={status === "ready"}
          busy={status === "starting" || status === "reconnecting" || restarting}
          disabled={status === "starting" || status === "reconnecting" || restarting}
          lastResult={null}
          onSendData={data => send({ type: "input", data })}
          onResize={(cols, rows) => send({ type: "resize", cols, rows })}
          interactiveReady={status === "ready"}
          cwdLabel="/workspace (disposable root lab)"
          recoverState={status === "starting" || status === "reconnecting" ? "starting" : status === "closed" || status === "error" ? "restart_available" : "none"}
          restarting={restarting}
          onRestart={restart}
          recoverMessage={error || (status === "closed" ? disposableCloseMessage("") : null)}
        />
      </div>
    </div>
  );
}
