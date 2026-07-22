"use client";

import { useEffect, useMemo, useState } from "react";
import { draftFilePairKey, keepEditorSelection } from "./editorSelection";
import type { FilePairSummary } from "./types";

type FileSide = "starter" | "solution";

function draftKey(pair: FilePairSummary, side: FileSide) {
  return `${draftFilePairKey(pair)}:${side}`;
}

export default function FilePairEditor(props: {
  topicKey: string;
  filePairs: FilePairSummary[];
  selectedExerciseId: string | null;
  onSaveMessageKey: (keyPath: string, value: string) => Promise<void>;
  onApplyBundleFileContent: (exerciseId: string, path: string, side: FileSide, value: string) => void;
}) {
  const pairs = useMemo(
    () => props.filePairs.filter((pair) => !props.selectedExerciseId || pair.exerciseId === props.selectedExerciseId),
    [props.filePairs, props.selectedExerciseId],
  );
  const [selectedPairKey, setSelectedPairKey] = useState("");
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedPairKey("");
    setDraftValues({});
  }, [props.topicKey]);

  useEffect(() => {
    const pairKeys = pairs.map(draftFilePairKey);
    setSelectedPairKey((current) => keepEditorSelection(current || null, pairKeys) ?? "");
  }, [pairs]);

  const selectedPair = pairs.find((pair) => draftFilePairKey(pair) === selectedPairKey) ?? pairs[0] ?? null;
  const setDraft = (key: string, value: string) => setDraftValues((current) => ({ ...current, [key]: value }));

  const renderPane = (pair: FilePairSummary, side: FileSide) => {
    const key = draftKey(pair, side);
    const messageKey = side === "starter" ? pair.starterMessageKey : pair.solutionMessageKey;
    const originalValue = side === "starter" ? pair.starterContent ?? "" : pair.solutionContent ?? "";
    const value = draftValues[key] ?? originalValue;
    const isDirty = value !== originalValue;

    return (
      <div className={side === "starter" ? "border-b border-slate-200 lg:border-b-0 lg:border-r" : ""}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{side}</span>
            {isDirty ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">dirty</span> : null}
            <p className="mt-1 max-w-[520px] truncate font-mono text-[11px] text-slate-500">
              {messageKey ? `message key: ${messageKey}` : "inline bundle content"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!isDirty}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              onClick={() => setDraft(key, originalValue)}
            >
              Revert
            </button>
            {messageKey ? (
              <button
                type="button"
                disabled={!isDirty}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                onClick={() => void props.onSaveMessageKey(messageKey, value)}
              >
                Save key
              </button>
            ) : (
              <button
                type="button"
                disabled={!isDirty}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                onClick={() => props.onApplyBundleFileContent(pair.exerciseId, pair.path, side, value)}
              >
                Apply to bundle
              </button>
            )}
          </div>
        </div>
        <textarea
          value={value}
          onChange={(event) => setDraft(key, event.target.value)}
          spellCheck={false}
          className="h-[58vh] w-full resize-y bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none"
        />
      </div>
    );
  };

  if (!pairs.length || !selectedPair) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
        Select a code-input exercise to inspect starter and solution files.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Starter/Solution files</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{selectedPair.exerciseId}</p>
          </div>
          <div className="text-xs text-slate-500">{pairs.length} file{pairs.length === 1 ? "" : "s"}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {pairs.map((pair) => {
            const key = draftFilePairKey(pair);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedPairKey(key)}
                className={`rounded-lg border px-2 py-1 font-mono text-xs ${key === draftFilePairKey(selectedPair) ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {pair.path}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-0 lg:grid-cols-2">
        {renderPane(selectedPair, "starter")}
        {renderPane(selectedPair, "solution")}
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        Message-key files save directly to the messages JSON. Inline files apply into Bundle JSON first; use Save Bundle to persist them.
      </div>
    </section>
  );
}
