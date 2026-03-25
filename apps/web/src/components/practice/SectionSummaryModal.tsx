"use client";

import React, { useEffect } from "react";
import PrettyValue from "./PrettyValue";
import MathMarkdown from "../markdown/MathMarkdown";

export type MissedItem = {
  title?: string;
  prompt?: string;
  expected?: any;
  yourAnswer?: any;
  explanation?: string;
};

export default function SectionSummaryModal({
  open,
  onClose,
  onNextSection,
  title,
  subtitle,
  correct,
  total,
  missed,
}: {
  open: boolean;
  onClose: () => void;
  onNextSection?: () => void;
  title?: string;
  subtitle?: string;
  correct: number;
  total: number;
  missed: MissedItem[];
}) {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const good = pct >= 70;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12] shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#0b0d12]/95 backdrop-blur">
          <div className="bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black tracking-tight">
                  {title ?? "Section Complete"}
                </div>
                <div className="mt-1 text-xs text-white/65">
                  {subtitle ?? "Here’s your score and what to review."}
                </div>
              </div>

              <button
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold text-white/80 hover:bg-white/15"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto max-h-[calc(90vh-112px)] p-4">
          {/* Congrats */}
          <div
            className={[
              "rounded-2xl border p-4",
              good
                ? "border-emerald-300/30 bg-emerald-300/10"
                : "border-white/10 bg-white/[0.03]",
            ].join(" ")}
          >
            <div className="text-lg font-black">
              {good ? "🎉 Congratulations!" : "✅ Nice work — keep going!"}
            </div>
            <div className="mt-1 text-sm text-white/80">
              You scored{" "}
              <span className="font-black text-white">{correct}</span> /{" "}
              <span className="font-black text-white">{total}</span>{" "}
              <span className="text-white/60">({pct}%)</span>
            </div>
            <div className="mt-2 text-xs text-white/65">
              Tip: review the missed items below and re-run the section on “Hard”
              if you want mastery.
            </div>

            {onNextSection ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={onNextSection}
                  className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-extrabold hover:bg-emerald-300/15"
                >
                  Next section
                </button>
                <button
                  onClick={onClose}
                  className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold hover:bg-white/15"
                >
                  Stay here
                </button>
              </div>
            ) : null}
          </div>

          {/* Missed list */}
          <div className="mt-4">
            <div className="text-xs font-extrabold text-white/60">
              Missed ({missed.length})
            </div>

            {missed.length === 0 ? (
              <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/75">
                Perfect run. No missed questions. 🔥
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {missed.map((m, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="text-sm font-black text-white/90">
                      {m.title ?? `Question ${idx + 1}`}
                    </div>

                    {m.prompt ? (
                      <div className="mt-1">
                        <MathMarkdown content={m.prompt} />
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs font-extrabold text-white/60">
                          Your answer
                        </div>
                        <div className="mt-1 text-xs text-white/85">
                          <PrettyValue value={m.yourAnswer} />
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs font-extrabold text-white/60">
                          Correct answer
                        </div>
                        <div className="mt-1 text-xs text-white/85">
                          <PrettyValue value={m.expected} />
                        </div>
                      </div>
                    </div>

                    {m.explanation ? (
                      <div className="mt-3 text-xs text-white/70">
                        <span className="font-extrabold text-white/80">
                          Explanation:
                        </span>{" "}
                        {m.explanation}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 z-10 border-t border-white/10 bg-[#0b0d12]/95 backdrop-blur p-3 text-xs text-white/55">
          Saved score + missed questions can be persisted server-side per session.
        </div>
      </div>
    </div>
  );
}
