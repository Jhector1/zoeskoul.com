"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExerciseSummary } from "./types";

type JsonObject = Record<string, unknown>;

type MessageLeaf = {
  keyPath: string;
  relativePath: string;
  value: string;
};

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : null;
}

function exerciseId(value: unknown) {
  const object = asObject(value);
  return typeof object?.id === "string" ? object.id : null;
}

function exercisesFromBundle(bundleJson: unknown) {
  const bundle = asObject(bundleJson);
  return Array.isArray(bundle?.exercises) ? bundle.exercises : [];
}

function getPath(root: unknown, keyPath: string) {
  const parts = keyPath.split(".").filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    const object = asObject(current);
    if (!object || !(part in object)) return undefined;
    current = object[part];
  }
  return current;
}

function collectStringLeaves(value: unknown, baseKey: string, relativePrefix = ""): MessageLeaf[] {
  if (typeof value === "string") {
    return [{ keyPath: baseKey, relativePath: relativePrefix || "value", value }];
  }

  const object = asObject(value);
  if (!object) return [];

  return Object.keys(object)
    .sort((a, b) => a.localeCompare(b))
    .flatMap((key) => {
      const nextBase = `${baseKey}.${key}`;
      const nextRelative = relativePrefix ? `${relativePrefix}.${key}` : key;
      return collectStringLeaves(object[key], nextBase, nextRelative);
    });
}

function messageBaseForExercise(exercise: unknown) {
  const object = asObject(exercise);
  return typeof object?.messageBase === "string" ? object.messageBase : null;
}

function refsFromExercise(value: unknown): string[] {
  const refs = new Set<string>();
  const visit = (node: unknown) => {
    if (typeof node === "string") {
      if (node.startsWith("@:")) refs.add(node.slice(2));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const object = asObject(node);
    if (!object) return;
    Object.values(object).forEach(visit);
  };
  visit(value);
  return [...refs].sort((a, b) => a.localeCompare(b));
}

function fieldTone(relativePath: string) {
  if (relativePath.includes("starterCode") || relativePath.includes("starterFiles")) return "starter";
  if (relativePath.includes("solutionCode") || relativePath.includes("solutionFiles")) return "solution";
  if (relativePath.includes("checks") || relativePath.includes("hint") || relativePath.includes("help")) return "support";
  if (relativePath.includes("option") || relativePath.includes("token") || relativePath.includes("question")) return "quiz";
  return "text";
}

function toneLabel(tone: string) {
  switch (tone) {
    case "starter":
      return "Starter";
    case "solution":
      return "Solution";
    case "support":
      return "Hint/check";
    case "quiz":
      return "Quiz text";
    default:
      return "Text";
  }
}

function fieldRows(leaves: MessageLeaf[]) {
  const priority = (leaf: MessageLeaf) => {
    const path = leaf.relativePath;
    if (path === "title") return 0;
    if (path === "prompt" || path === "question") return 1;
    if (path.includes("starterCode") || path.includes("starterFiles")) return 2;
    if (path.includes("solutionCode") || path.includes("solutionFiles")) return 3;
    if (path.includes("checks")) return 4;
    return 5;
  };
  return [...leaves].sort((a, b) => priority(a) - priority(b) || a.relativePath.localeCompare(b.relativePath));
}

function isCodeLike(path: string, value: string) {
  return path.includes("Code") || path.includes("Files") || value.includes("\n") || value.includes("def ") || value.includes("class ");
}

export default function ExerciseMessageEditor(props: {
  exercises: ExerciseSummary[];
  selectedExerciseId: string | null;
  bundleJson: unknown;
  messagesJson: unknown;
  onSelect: (exerciseId: string) => void;
  onSaveMessageKey: (keyPath: string, value: string) => Promise<void>;
}) {
  const bundleExercises = useMemo(() => exercisesFromBundle(props.bundleJson), [props.bundleJson]);
  const selectedExercise = useMemo(
    () => bundleExercises.find((exercise) => exerciseId(exercise) === props.selectedExerciseId) ?? null,
    [bundleExercises, props.selectedExerciseId],
  );
  const messageBase = useMemo(() => messageBaseForExercise(selectedExercise), [selectedExercise]);
  const messageObject = useMemo(() => (messageBase ? getPath(props.messagesJson, messageBase) : undefined), [messageBase, props.messagesJson]);
  const leaves = useMemo(() => (messageBase ? fieldRows(collectStringLeaves(messageObject, messageBase)) : []), [messageBase, messageObject]);
  const refs = useMemo(() => refsFromExercise(selectedExercise), [selectedExercise]);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [showRefs, setShowRefs] = useState(false);

  useEffect(() => {
    setDraftValues({});
  }, [props.selectedExerciseId, messageBase]);

  const saveLeaf = async (leaf: MessageLeaf) => {
    await props.onSaveMessageKey(leaf.keyPath, draftValues[leaf.keyPath] ?? leaf.value);
  };

  const selectedSummary = props.exercises.find((exercise) => exercise.id === props.selectedExerciseId) ?? null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Exercise content from messages</h2>
          <p className="mt-1 text-xs text-slate-500">
            Edit learner-facing exercise text, starter code, solution code, quiz options, hints, and check messages from messages JSON. Bundle JSON stays structural.
          </p>
          {messageBase ? <p className="mt-2 max-w-4xl truncate font-mono text-[11px] text-slate-500">{messageBase}</p> : null}
        </div>
        <select
          value={props.selectedExerciseId ?? ""}
          onChange={(event) => event.target.value && props.onSelect(event.target.value)}
          className="max-w-[420px] rounded-xl border border-slate-200 px-3 py-2 text-xs"
        >
          <option value="">Select exercise</option>
          {props.exercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.id} · {exercise.kind} · {exercise.purpose ?? "no-purpose"}
            </option>
          ))}
        </select>
      </div>

      {!selectedExercise ? (
        <div className="p-6 text-sm text-slate-500">Select an exercise to edit its message-backed content.</div>
      ) : !messageBase ? (
        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This exercise does not have a <span className="font-mono">messageBase</span>. Add one in the structure editor before editing message content here.
        </div>
      ) : leaves.length === 0 ? (
        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No message strings were found under this exercise message base. Check whether the messages file contains this path.
        </div>
      ) : (
        <div>
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 md:grid-cols-3">
            <div>
              <span className="font-semibold text-slate-800">Exercise:</span> <span className="font-mono">{selectedSummary?.id ?? props.selectedExerciseId}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Kind:</span> {selectedSummary?.kind ?? "unknown"}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Message fields:</span> {leaves.length}
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {leaves.map((leaf) => {
              const value = draftValues[leaf.keyPath] ?? leaf.value;
              const dirty = value !== leaf.value;
              const tone = fieldTone(leaf.relativePath);
              const codeLike = isCodeLike(leaf.relativePath, value);
              return (
                <div key={leaf.keyPath} className="p-4">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{toneLabel(tone)}</span>
                        {dirty ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">dirty</span> : null}
                      </div>
                      <p className="mt-1 font-mono text-xs font-semibold text-slate-800">{leaf.relativePath}</p>
                      <p className="mt-1 max-w-4xl truncate font-mono text-[11px] text-slate-500">{leaf.keyPath}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!dirty}
                        onClick={() => setDraftValues((current) => ({ ...current, [leaf.keyPath]: leaf.value }))}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        Revert
                      </button>
                      <button
                        type="button"
                        disabled={!dirty}
                        onClick={() => void saveLeaf(leaf)}
                        className="rounded-lg bg-slate-950 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Save key
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={value}
                    onChange={(event) => setDraftValues((current) => ({ ...current, [leaf.keyPath]: event.target.value }))}
                    spellCheck={false}
                    className={`w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 ${codeLike ? "min-h-40 font-mono" : "min-h-20"}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedExercise ? (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <button type="button" onClick={() => setShowRefs((value) => !value)} className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-2">
            {showRefs ? "Hide" : "Show"} bundle message refs
          </button>
          {showRefs ? (
            <div className="mt-3 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5">
              {refs.length ? refs.map((ref) => <div key={ref}>{ref}</div>) : <div>No @: refs found in this exercise structure.</div>}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
