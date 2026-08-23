"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExerciseSummary } from "./types";

type JsonObject = Record<string, unknown>;

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

function pretty(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJson(text: string) {
  try {
    return { value: JSON.parse(text) as unknown, error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

export default function ExerciseJsonEditor(props: {
  exercises: ExerciseSummary[];
  selectedExerciseId: string | null;
  bundleJson: unknown;
  onSelect: (exerciseId: string) => void;
  onApplyExerciseJson: (exerciseId: string, exerciseJson: unknown) => void;
}) {
  const bundleExercises = useMemo(() => exercisesFromBundle(props.bundleJson), [props.bundleJson]);
  const selectedExercise = useMemo(
    () => bundleExercises.find((exercise) => exerciseId(exercise) === props.selectedExerciseId) ?? null,
    [bundleExercises, props.selectedExerciseId],
  );
  const [text, setText] = useState(() => pretty(selectedExercise));

  useEffect(() => {
    setText(pretty(selectedExercise));
  }, [selectedExercise]);

  const parsed = useMemo(() => parseJson(text), [text]);
  const parsedId = exerciseId(parsed.value);
  const canApply = Boolean(selectedExercise && !parsed.error && parsedId === props.selectedExerciseId);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Exercise structure JSON editor</h2>
          <p className="mt-1 text-xs text-slate-500">Use this only for structure: kind, purpose, paths, refs, and semantic check parameters. Edit learner-facing content in the message editor above.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={props.selectedExerciseId ?? ""}
            onChange={(event) => event.target.value && props.onSelect(event.target.value)}
            className="max-w-[360px] rounded-xl border border-slate-200 px-3 py-2 text-xs"
          >
            <option value="">Select exercise</option>
            {props.exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.id} · {exercise.kind} · {exercise.purpose ?? "no-purpose"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setText(pretty(parsed.error ? selectedExercise : parsed.value))}
            disabled={!selectedExercise}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Format
          </button>
          <button
            type="button"
            onClick={() => selectedExercise && setText(pretty(selectedExercise))}
            disabled={!selectedExercise}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Revert
          </button>
          <button
            type="button"
            onClick={() => {
              if (props.selectedExerciseId && parsed.value) props.onApplyExerciseJson(props.selectedExerciseId, parsed.value);
            }}
            disabled={!canApply}
            className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply to bundle
          </button>
        </div>
      </div>

      {parsed.error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{parsed.error}</div>
      ) : parsedId !== props.selectedExerciseId ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Exercise id must stay as <span className="font-mono">{props.selectedExerciseId}</span>. Parsed id is <span className="font-mono">{parsedId ?? "missing"}</span>.
        </div>
      ) : null}

      {!selectedExercise ? (
        <div className="p-6 text-sm text-slate-500">Select an exercise to edit its structural JSON.</div>
      ) : (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          className="h-[46vh] w-full resize-y rounded-b-2xl bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none"
        />
      )}
    </section>
  );
}
