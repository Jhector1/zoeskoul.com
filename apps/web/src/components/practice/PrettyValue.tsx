"use client";

import React from "react";

function isVec(v: any) {
  return v && typeof v === "object" && typeof v.x === "number" && typeof v.y === "number";
}

function fmtNum(n: number) {
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : String(n);
}

export default function PrettyValue({ value }: { value: any }) {
  if (value === undefined) return <span className="text-white/50">—</span>;
  if (value === null) return <span className="text-white/50">null</span>;

  if (typeof value === "string") {
    return <span className="break-words">{value}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="tabular-nums">{String(value)}</span>;
  }

  // Vector: {x,y,z?}
  if (isVec(value)) {
    const z = typeof value.z === "number" ? `, ${fmtNum(value.z)}` : "";
    return (
      <span className="font-mono text-white/90">
        ({fmtNum(value.x)}, {fmtNum(value.y)}
        {z})
      </span>
    );
  }

  // Array of strings/numbers → chips
  if (Array.isArray(value) && value.every((x) => ["string", "number"].includes(typeof x))) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((x, i) => (
          <span
            key={i}
            className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] font-extrabold text-white/80"
          >
            {String(x)}
          </span>
        ))}
      </div>
    );
  }

  // Fallback: pretty JSON in a <pre>
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-2 text-[11px] leading-relaxed text-white/80">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
