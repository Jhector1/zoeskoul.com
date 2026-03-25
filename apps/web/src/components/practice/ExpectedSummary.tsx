"use client";

import React, { useMemo, useState } from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";

type Props = {
  /**
   * Pass your submit/validate response here (whatever you store as submitRes).
   * This component will try to find expected/correctAnswer/reveal/debug fields.
   */
  result: any | null;
  title?: string;

  showDebug?: boolean;
};

function prettyJson(x: any) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
}

function pickExpectedPayload(result: any) {
  if (!result) return null;

  // Common shapes
  const candidates = [
    result.expected,
    result.correctAnswer,
    result.correct,
    result.solution,
    result.reveal,
    result.debug?.expected,
    result.debug?.correctAnswer,
    result.data?.expected,
    result.data?.correctAnswer,
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null) return c;
  }
  return null;
}

export default function ExpectedSummary({
  result,
  title = "Expected / Reveal",
  showDebug = false,
}: Props) {
  const [open, setOpen] = useState(false);

  const expected = useMemo(() => pickExpectedPayload(result), [result]);

  if (!result) return null;

  const hasSomething =
    expected !== null ||
    result.explanation ||
    result.message ||
    result.revealUsed ||
    result.ok === true ||
    result.ok === false;

  if (!hasSomething) return null;

  const ok = Boolean(result.ok);
  const bannerCls = ok
    ? "border-emerald-400/30 bg-emerald-300/10 text-emerald-100"
    : "border-rose-400/30 bg-rose-300/10 text-rose-100";

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-extrabold text-white/60">{title}</div>

          <div
            className={["mt-2 rounded-xl border p-3 text-sm", bannerCls].join(
              " ",
            )}
          >
            <div className="font-extrabold">
              {ok ? "✅ Correct" : "❌ Not quite"}
            </div>

            {result.message ? (
              <div className="mt-1 whitespace-pre-wrap text-white/85">
                {String(result.message)}
              </div>
            ) : null}

            {result.explanation ? (
              <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3 text-white/90">
                <MathMarkdown content={String(result.explanation)} />
              </div>
            ) : null}

            {result.revealUsed ? (
              <div className="mt-2 text-xs font-bold text-white/60">
                Reveal was used for this attempt.
              </div>
            ) : null}
          </div>
        </div>

        {/* toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-extrabold text-white/80 hover:bg-black/30"
        >
          {open ? "Hide details" : "Show details"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          {expected !== null ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-extrabold text-white/60">
                expected
              </div>
              <pre className="mt-2 overflow-x-auto text-xs text-white/85">
                {prettyJson(expected)}
              </pre>
            </div>
          ) : null}

          {showDebug ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-extrabold text-white/60">
                raw result
              </div>
              <pre className="mt-2 overflow-x-auto text-xs text-white/70">
                {prettyJson(result)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
