"use client";

import type { DraftDiagnostic } from "./types";

function severityClass(severity: DraftDiagnostic["severity"]) {
  if (severity === "error") return "border-red-200 bg-red-50 text-red-900";
  if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-sky-200 bg-sky-50 text-sky-950";
}

export default function DiagnosticsPanel(props: { diagnostics: DraftDiagnostic[] }) {
  const errors = props.diagnostics.filter((item) => item.severity === "error").length;
  const warnings = props.diagnostics.filter((item) => item.severity === "warning").length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-950">Diagnostics</h2>
        <div className="text-xs text-slate-500">
          {errors} errors · {warnings} warnings
        </div>
      </div>
      <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
        {props.diagnostics.length === 0 ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            No diagnostics for the loaded topic.
          </p>
        ) : (
          props.diagnostics.map((item, index) => (
            <div key={`${item.code}-${index}`} className={`rounded-xl border px-3 py-2 text-xs ${severityClass(item.severity)}`}>
              <div className="font-semibold">{item.code}</div>
              <div className="mt-1 leading-5">{item.message}</div>
              {item.exerciseId || item.path ? (
                <div className="mt-1 font-mono opacity-80">
                  {[item.exerciseId, item.path].filter(Boolean).join(" · ")}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
