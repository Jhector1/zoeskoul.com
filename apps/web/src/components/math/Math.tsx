// src/components/math/Math.tsx
"use client";
import "katex/dist/katex.min.css";
import katex from "katex";

export function MathInline({ tex }: { tex: string }) {
  return (
    <span
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(tex, { throwOnError: false }),
      }}
    />
  );
}

export function MathBlock({ tex }: { tex: string }) {
  return (
    <div
      className="overflow-x-auto"
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(tex, { displayMode: true, throwOnError: false }),
      }}
    />
  );
}
