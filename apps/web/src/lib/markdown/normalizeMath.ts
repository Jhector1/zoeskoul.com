// src/lib/markdown/normalizeMath.ts
export function normalizeMath(md: string) {
  const s = String(md ?? "");

  const ttWrapped = s.replace(
    /\\\(\s*\\texttt\{([\s\S]*?)\}\s*\\\)/g,
    (_m, inner) => `\`${String(inner).trim()}\``,
  );

  const tt = ttWrapped.replace(
    /\\texttt\{([\s\S]*?)\}/g,
    (_m, inner) => `\`${String(inner).trim()}\``,
  );

  const inline = tt.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_m, inner) => `$${String(inner).trim()}$`,
  );

  const display = inline.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_m, inner) => `$$\n${String(inner).trim()}\n$$`,
  );

  return display;
}
