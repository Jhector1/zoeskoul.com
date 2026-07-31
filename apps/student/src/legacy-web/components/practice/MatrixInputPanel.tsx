// src/components/practice/MatrixInputPanel.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import MatrixEntryInput from "./MatrixEntryInput";
import { clampInt } from "@/lib/practice/matrixHelpers";

export default function MatrixInputPanel({
  labelLatex = String.raw`\mathbf{A}=`,
  rows,
  cols,
  allowResize = false,
  value,
  readOnly = false,
  onShapeChange,
  onChange,
  maxDim = 10,

  // ✅ NEW (optional): required shape, but we won’t display numbers
  requiredRows,
  requiredCols,
}: {
  labelLatex?: string;
  rows: number;
  cols: number;
  allowResize?: boolean;
  value: string[][];
  readOnly?: boolean;
  maxDim?: number;
  onShapeChange: (rows: number, cols: number) => void;
  onChange: (next: string[][]) => void;

  requiredRows?: number;
  requiredCols?: number;
}) {
  const [rDraft, setRDraft] = useState(String(rows));
  const [cDraft, setCDraft] = useState(String(cols));
  const [shapeTouched, setShapeTouched] = useState(false);

  useEffect(() => setRDraft(String(rows)), [rows]);
  useEffect(() => setCDraft(String(cols)), [cols]);

  const canResize = allowResize && !readOnly;

  const req = useMemo(() => {
    const rr = Number(requiredRows);
    const cc = Number(requiredCols);
    if (Number.isFinite(rr) && Number.isFinite(cc) && rr >= 1 && cc >= 1) {
      return { rows: Math.floor(rr), cols: Math.floor(cc) };
    }
    return null;
  }, [requiredRows, requiredCols]);

  const applyShape = () => {
    setShapeTouched(true);
    const r = clampInt(parseInt(rDraft, 10), 1, maxDim);
    const c = clampInt(parseInt(cDraft, 10), 1, maxDim);
    onShapeChange(r, c);
  };

  // ✅ show error only after Apply, and never reveal required numbers
  const shapeMismatch =
    shapeTouched && req ? rows !== req.rows || cols !== req.cols : false;

  return (
    <div className="grid gap-3">
      {canResize ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <div className="text-[11px] font-extrabold text-white/60">Rows</div>
              <input
                className="w-20 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-extrabold text-white/90 outline-none"
                inputMode="numeric"
                value={rDraft}
                onChange={(e) => setRDraft(e.target.value)}
              />
            </div>

            <div className="grid gap-1">
              <div className="text-[11px] font-extrabold text-white/60">Cols</div>
              <input
                className="w-20 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-extrabold text-white/90 outline-none"
                inputMode="numeric"
                value={cDraft}
                onChange={(e) => setCDraft(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={applyShape}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold hover:bg-white/15"
            >
              Apply
            </button>

            <div className="text-[11px] text-white/45">
              Max {maxDim}×{maxDim}
            </div>
          </div>

          {shapeMismatch ? (
            <div className="rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-[11px] font-extrabold text-rose-100/90">
              Shape is incorrect for this question.
            </div>
          ) : null}
        </div>
      ) : null}

      <MatrixEntryInput
        labelLatex={labelLatex}
        rows={rows}
        cols={cols}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
      />
    </div>
  );
}
