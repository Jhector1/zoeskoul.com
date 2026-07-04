"use client";

import { useMemo } from "react";

function parseJson(value: string) {
  try {
    return { value: JSON.parse(value) as unknown, error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

function countLines(value: string) {
  return value ? value.split("\n").length : 0;
}

export default function JsonEditor(props: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const parsed = useMemo(() => parseJson(props.value), [props.value]);
  const displayedError = props.error ?? parsed.error;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{props.title}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {countLines(props.value).toLocaleString()} lines · {props.value.length.toLocaleString()} characters
          </p>
          {displayedError ? <p className="mt-1 text-xs text-red-600">{displayedError}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => parsed.value && props.onChange(JSON.stringify(parsed.value, null, 2))}
            disabled={Boolean(parsed.error)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Format JSON
          </button>
          <button
            type="button"
            onClick={props.onSave}
            disabled={props.disabled || Boolean(parsed.error)}
            className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
      <textarea
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        spellCheck={false}
        className="h-[66vh] w-full resize-y rounded-b-2xl bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none"
      />
    </section>
  );
}
