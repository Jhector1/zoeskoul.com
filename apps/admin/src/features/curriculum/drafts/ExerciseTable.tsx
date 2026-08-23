"use client";

import type { ExerciseSummary } from "./types";

export default function ExerciseTable(props: {
  exercises: ExerciseSummary[];
  selectedExerciseId: string | null;
  onSelect: (exerciseId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">Exercises</h2>
        <p className="mt-1 text-xs text-slate-500">Click an exercise to inspect starter and solution files.</p>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">ID</th>
              <th className="px-3 py-2 font-semibold">Kind</th>
              <th className="px-3 py-2 font-semibold">Purpose</th>
              <th className="px-3 py-2 font-semibold">Refs</th>
              <th className="px-3 py-2 font-semibold">Files</th>
              <th className="px-3 py-2 font-semibold">Checks</th>
              <th className="px-3 py-2 font-semibold">Issues</th>
            </tr>
          </thead>
          <tbody>
            {props.exercises.map((exercise) => (
              <tr
                key={exercise.id}
                onClick={() => props.onSelect(exercise.id)}
                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                  props.selectedExerciseId === exercise.id ? "bg-emerald-50" : ""
                }`}
              >
                <td className="max-w-[320px] truncate px-3 py-2 font-mono text-slate-900">{exercise.id}</td>
                <td className="px-3 py-2 text-slate-700">{exercise.kind}</td>
                <td className="px-3 py-2 text-slate-700">{exercise.purpose ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{exercise.referencedBy.length}</td>
                <td className="px-3 py-2 text-slate-700">
                  {exercise.starterFileCount}/{exercise.solutionFileCount}
                </td>
                <td className="px-3 py-2 text-slate-700">{exercise.checkCount}</td>
                <td className="px-3 py-2">
                  {exercise.diagnostics.length ? (
                    <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">{exercise.diagnostics.length}</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
