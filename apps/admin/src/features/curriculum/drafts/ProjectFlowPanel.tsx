"use client";

import type { ProjectFlowStep } from "./types";

export default function ProjectFlowPanel(props: { steps: ProjectFlowStep[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">Project flow</h2>
        <p className="mt-1 text-xs text-slate-500">Checks whether each cumulative step starts from the previous solution.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {props.steps.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No project/capstone steps in this topic.</p>
        ) : (
          props.steps.map((step) => (
            <div key={`${step.cardId}-${step.index}-${step.stepId}`} className="p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-950">{step.cardId} · Step {step.index + 1}</div>
                  <div className="mt-1 font-mono text-xs text-slate-500">{step.stepId} · {step.exerciseKey ?? "missing exerciseKey"}</div>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className={`rounded-full px-2 py-1 ${step.carryFromPrev || step.index === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    carry: {step.carryFromPrev ? "yes" : step.index === 0 ? "n/a" : "no"}
                  </span>
                  <span className={`rounded-full px-2 py-1 ${step.matchesPreviousSolution !== false ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    previous: {step.matchesPreviousSolution === null ? "n/a" : step.matchesPreviousSolution ? "match" : "mismatch"}
                  </span>
                </div>
              </div>
              {step.matchesPreviousSolution === false ? (
                <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                  <div><span className="font-semibold">Added:</span> {step.addedFiles.join(", ") || "—"}</div>
                  <div><span className="font-semibold">Removed:</span> {step.removedFiles.join(", ") || "—"}</div>
                  <div><span className="font-semibold">Changed:</span> {step.changedFiles.join(", ") || "—"}</div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
