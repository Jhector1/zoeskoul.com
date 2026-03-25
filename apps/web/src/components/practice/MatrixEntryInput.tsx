"use client";

import React, { useMemo } from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";

type Props = {
  labelLatex?: string; // e.g. \mathbf{A}=
  rows: number;
  cols: number;
  value: string[][];
  onChange: (next: string[][]) => void;
  cellWidthClass?: string; // "w-14" | "w-16" etc
  readOnly?: boolean;
};

function normalizeGrid(value: string[][], rows: number, cols: number) {
  const r = Math.max(1, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  return Array.from({ length: r }, (_, i) =>
    Array.from({ length: c }, (_, j) => String(value?.[i]?.[j] ?? ""))
  );
}

function phantomForRows(rows: number) {
  const r = Math.max(1, Math.floor(rows));
  return String.raw`\vphantom{\begin{matrix}${Array.from({ length: r })
    .map(() => "0")
    .join("\\\\")}\end{matrix}}`;
}

export default function MatrixEntryInput({
  labelLatex = String.raw`\mathbf{A}=`,
  rows,
  cols,
  value,
  onChange,
  cellWidthClass = "w-16",
  readOnly = false,
}: Props) {
  const grid = useMemo(() => normalizeGrid(value, rows, cols), [value, rows, cols]);

  return (
    <div className="flex items-start gap-3">
      <MathMarkdown className="text-white/90" content={`$${labelLatex}$`} />

      <div className="max-w-full overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex items-center">
          <MathMarkdown
            className="text-white/90"
            content={String.raw`$\left[${phantomForRows(rows)}\right.$`}
          />

          <div
            className="mx-2 grid gap-x-3 gap-y-2"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))` }}
          >
            {grid.map((row, r) =>
              row.map((cell, c) => (
                <input
                  key={`${r}-${c}`}
                  type="text"
                  inputMode="decimal"
                  value={cell}
                  readOnly={readOnly}
                  disabled={readOnly}
                  onChange={(e) => {
                    if (readOnly) return;
                    const next = grid.map((rr) => rr.slice());
                    next[r][c] = e.target.value;
                    onChange(next);
                  }}
                  className={[
                    cellWidthClass,
                    "rounded-md border border-white/10 bg-black/30",
                    "px-2 py-1 text-center text-xs font-mono font-extrabold text-white/90",
                    "outline-none focus:border-emerald-400/60 disabled:opacity-60",
                  ].join(" ")}
                  placeholder="0"
                />
              ))
            )}
          </div>

          <MathMarkdown
            className="text-white/90"
            content={String.raw`$\left.${phantomForRows(rows)}\right]$`}
          />
        </div>
      </div>
    </div>
  );
}
