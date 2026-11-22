"use client";

import * as React from "react";
import type { RunSessionState } from "@zoeskoul/code-contracts";
import type { TerminalChunk } from "@zoeskoul/learner-workspace/runner/runtime";
import { useRunSession } from "@zoeskoul/learner-workspace/runner/useRunSession";
import XtermTerminal from "@zoeskoul/learner-workspace/runner/components/XtermTerminal";
import { matchesDraftAdminQaLocation } from "@/lib/dev/curriculumDrafts/adminLabQaClientSelection";
import type { ScopedAdminTerminalSelection } from "@/lib/learning/client/resolveScopedAdminTerminal";

type PrivilegedSelection = Exclude<ScopedAdminTerminalSelection, {kind: "ordinary"}>;
type StartResponse = {ok: true; sessionId: string; state: RunSessionState; wsUrl: string} | {ok: false; error: string};
type Exercise = {key: string; title: string; instructions?: string};
const draftApi = "/api/admin/curriculum-drafts/admin-lab";
const studentApi = "/api/run/pty/sessions/admin/start";
const terminalFinal = (state: string) => ["completed", "failed", "canceled", "timed_out"].includes(state);

/** Same terminal transport and xterm as the ordinary IDE; privileged admission is Web/Runner-only. */
export default function ScopedAdminLabTerminal({selection}: {selection: PrivilegedSelection}) {
  const runner = useRunSession();
  const [feed, setFeed] = React.useState<TerminalChunk[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [exercises, setExercises] = React.useState<Exercise[]>([]);
  const [selectedKey, setSelectedKey] = React.useState("");
  const currentRef = React.useRef<string | null>(null);
  const disposedRef = React.useRef(false);
  const launchingRef = React.useRef(false);
  const lastSeqRef = React.useRef(0);
  const nextIdRef = React.useRef(1);
  const isDraft = selection.kind === "draft";

  const append = React.useCallback((kind: TerminalChunk["kind"], data: string) => {
    if (data) setFeed((before) => [...before, {id: nextIdRef.current++, kind, data}]);
  }, []);
  const cancel = React.useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/run/pty/sessions/${encodeURIComponent(id)}/cancel`, {
        method: "POST", credentials: "same-origin", keepalive: true,
      });
      return res.ok;
    } catch { return false; }
  }, []);

  React.useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      const id = currentRef.current;
      currentRef.current = null;
      if (id) void cancel(id);
      runner.closeSocket();
    };
  // The terminal is keyed by the exact course/topic. Navigation unmounts it.
  }, [cancel, runner.closeSocket]);

  React.useEffect(() => {
    if (selection.kind !== "draft") return;
    const params = new URLSearchParams(Object.entries(selection.draft));
    fetch(`${draftApi}/exercises?${params.toString()}`, {credentials: "same-origin"})
      .then(async (res) => res.ok ? res.json() : null)
      .then((data) => {
        if (disposedRef.current || data?.ok !== true || !Array.isArray(data.exercises)) return;
        setExercises(data.exercises as Exercise[]);
        setSelectedKey(data.exercises[0]?.key ?? "");
      }).catch(() => {});
  }, [selection]);

  React.useEffect(() => {
    if (!activeId || runner.eventsSessionId !== activeId) return;
    for (const event of runner.events) {
      if (event.seq <= lastSeqRef.current) continue;
      lastSeqRef.current = event.seq;
      if (event.type === "stdout") append("pty", event.chunk);
      else if (event.type === "stderr") append("err", event.chunk);
      else if (event.type === "error") append("err", `\r\n${event.message}\r\n`);
      else if (event.type === "exit") append("sys", `\r\n[exit ${event.code}]\r\n`);
    }
  }, [activeId, append, runner.events, runner.eventsSessionId]);

  const validDraftLocation = React.useCallback(() => {
    return selection.kind !== "draft" ||
      matchesDraftAdminQaLocation(window.location.search, selection.draft);
  }, [selection]);

  const start = React.useCallback(async () => {
    if (launchingRef.current || currentRef.current || disposedRef.current) return;
    if (!validDraftLocation()) {
      setError("Draft lesson changed; open the approved Course 2 administrator lesson.");
      return;
    }
    launchingRef.current = true;
    setPending(true);
    setError(null);
    setResult(null);
    setFeed([]);
    lastSeqRef.current = 0;
    nextIdRef.current = 1;
    try {
      const target = selection.kind === "draft" ? selection.draft : selection.target;
      // The server independently validates the target and signs the one-use grant.
      const res = await fetch(isDraft ? `${draftApi}/start` : studentApi, {
        method: "POST", credentials: "same-origin",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(target),
      });
      const reply = await res.json() as StartResponse;
      if (!res.ok || reply.ok !== true) {
        throw new Error(reply.ok === false ? reply.error : "Administrator sandbox unavailable.");
      }
      if (!reply.sessionId || !reply.wsUrl || !reply.state) throw new Error("Invalid sandbox response.");
      if (disposedRef.current) { await cancel(reply.sessionId); return; }
      currentRef.current = reply.sessionId;
      setActiveId(reply.sessionId);
      runner.connect(reply.sessionId, reply.state, reply.wsUrl);
    } catch (reason) {
      if (!disposedRef.current) setError(reason instanceof Error ? reason.message : "Sandbox launch failed.");
    } finally {
      launchingRef.current = false;
      if (!disposedRef.current) setPending(false);
    }
  }, [cancel, isDraft, runner.connect, selection, validDraftLocation]);

  const stop = React.useCallback(async () => {
    const id = currentRef.current;
    if (!id || stopping) return;
    setStopping(true);
    try {
      if (!await cancel(id)) {
        setError("Session cancellation not confirmed. Retry; operator OFF remains the backstop.");
        return;
      }
      if (currentRef.current === id) currentRef.current = null;
      runner.closeSocket();
      setActiveId(null);
      append("sys", "\r\n[administrator sandbox stopped]\r\n");
    } finally {setStopping(false);}
  }, [cancel, stopping, append, runner.closeSocket]);

  const verify = React.useCallback(async () => {
    if (selection.kind !== "draft" || !activeId || !selectedKey || verifying) return;
    if (!validDraftLocation()) {
      setError("Draft selection changed; verification blocked.");
      return;
    }
    setVerifying(true);
    setResult(null);
    try {
      const res = await fetch(`${draftApi}/verify`, {
        method: "POST", credentials: "same-origin",
        headers: {"Content-Type": "application/json"}, body: JSON.stringify({key: selectedKey}),
      });
      const data = await res.json();
      if (!res.ok || typeof data?.passed !== "boolean") throw new Error(data?.error || "Verification unavailable.");
      setResult(`${data.passed ? "PASS" : "FAIL"} — ${data.explanation}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Verification failed.");
    } finally { setVerifying(false); }
  }, [selection, activeId, selectedKey, verifying, validDraftLocation]);

  const running = Boolean(activeId) && !terminalFinal(runner.state);
  const interactive = running && ["running", "waiting_for_input"].includes(runner.state) &&
    runner.connectionState === "connected";
  const selected = exercises.find((e) => e.key === selectedKey);
  return <section aria-label={isDraft ? "Draft administrator lab QA" : "Isolated Linux administrator terminal"}
    className="flex h-full min-h-0 flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-white/10">
      <div className="min-w-0"><h3 className="text-sm font-semibold">Linux terminal · isolated administrator lab</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {isDraft ? "Author-only QA · disposable sandbox · no student grades" :
            "This lesson uses an isolated sandbox. Access is checked by the server."}
        </p></div>
      {!activeId ? <button type="button" onClick={() => void start()} disabled={pending}
        className="border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-white/20">
        {pending ? "Starting…" : "Open terminal"}</button>
        : <button type="button" onClick={() => void stop()} disabled={stopping}
          className="border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-white/20">
          {stopping ? "Stopping…" : "Stop terminal"}</button>}
    </div>
    {error && <p role="alert" className="px-3 py-2 text-xs text-red-600 dark:text-red-300">{error}</p>}
    <div className="min-h-0 flex-1 overflow-hidden">
      {activeId ? <XtermTerminal terminalFeed={feed} inputEnabled={interactive} busy={running}
        disabled={!interactive || stopping} lastResult={null}
        onSendData={(data) => {if (interactive) void runner.sendInput(data);}}
        onResize={(cols, rows) => {if (running) void runner.resize(cols, rows);}}
        interactiveReady={interactive} />
        : <p className="px-3 py-4 text-xs text-neutral-500">Open the lesson terminal to start an authorized, disposable sandbox. No terminal mode switching is required.</p>}
    </div>
    {isDraft && <div className="shrink-0 border-t border-neutral-200 px-3 py-2 text-xs dark:border-white/10">
      {exercises.length > 0 ? <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="draft-admin-fs-check">Filesystem check</label>
        <select id="draft-admin-fs-check" value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}
          className="border border-neutral-300 bg-transparent px-2 py-1 dark:border-white/20">
          {exercises.map((exercise) => <option key={exercise.key} value={exercise.key}>{exercise.title}</option>)}
        </select>
        <button type="button" disabled={!interactive || verifying || !selectedKey}
          onClick={() => void verify()} className="border border-neutral-300 px-2 py-1 disabled:opacity-50 dark:border-white/20">
          {verifying ? "Checking…" : "Verify filesystem"}</button>
      </div> : <p className="text-neutral-500">No trusted filesystem expectations authored for this topic.</p>}
      {selected?.instructions && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap border p-2 text-xs dark:border-white/10">{selected.instructions}</pre>}
      {result && <p role="status" className="mt-2 font-semibold">{result} (QA only; no recorded attempt)</p>}
    </div>}
  </section>;
}
