// src/components/MathText.tsx
"use client";

import { InlineMath, BlockMath } from "react-katex";

export default function MathText({
  text,
}: {
  text: string;
}) {
  // very simple: render $$...$$ blocks as BlockMath, and \( ... \) as InlineMath
  // (you can improve later; this is enough to stop “raw LaTeX” showing)
  const parts: Array<{ kind: "text" | "inline" | "block"; value: string }> = [];

  let s = text;

  // blocks: $$...$$
  while (true) {
    const i = s.indexOf("$$");
    if (i === -1) break;
    const j = s.indexOf("$$", i + 2);
    if (j === -1) break;

    if (i > 0) parts.push({ kind: "text", value: s.slice(0, i) });
    parts.push({ kind: "block", value: s.slice(i + 2, j) });
    s = s.slice(j + 2);
  }

  // now inline: \( ... \)
  const inlineParts: typeof parts = [];
  for (const p of (parts.length ? parts : [{ kind: "text", value: s }]) as any) {
    if (p.kind !== "text") {
      inlineParts.push(p);
      continue;
    }
    let t = p.value as string;
    while (true) {
      const i = t.indexOf("\\(");
      if (i === -1) break;
      const j = t.indexOf("\\)", i + 2);
      if (j === -1) break;

      if (i > 0) inlineParts.push({ kind: "text", value: t.slice(0, i) });
      inlineParts.push({ kind: "inline", value: t.slice(i + 2, j) });
      t = t.slice(j + 2);
    }
    if (t) inlineParts.push({ kind: "text", value: t });
  }

  return (
    <div className="text-sm text-white/80 whitespace-pre-wrap break-words">
      {inlineParts.map((p, idx) => {
        if (p.kind === "block") return <BlockMath key={idx}>{p.value}</BlockMath>;
        if (p.kind === "inline") return <InlineMath key={idx}>{p.value}</InlineMath>;
        return <span key={idx}>{p.value}</span>;
      })}
    </div>
  );
}
