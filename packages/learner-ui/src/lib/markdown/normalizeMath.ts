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

const STRUCTURED_EXERCISE_PROMPT_START =
  /^\s*\*\*(?:Problem|Task|Expected result)\*\*(?=\s|$)/;

const STRUCTURED_EXERCISE_PROMPT_LABEL =
  /(?:[ \t]*\r?\n)*[ \t]*(\*\*(?:Problem|Task|Expected result)\*\*)[ \t]*(?:(?:\r?\n)[ \t]*)*/g;

export function normalizeStructuredExercisePromptLayout(
  value: string,
): string {
  const source = String(value ?? "");

  if (!STRUCTURED_EXERCISE_PROMPT_START.test(source)) {
    return source;
  }

  return source
    .replace(
      STRUCTURED_EXERCISE_PROMPT_LABEL,
      (_match, label: string, offset: number) =>
        `${offset === 0 ? "" : "\n\n"}${label}\n\n`,
    )
    .replace(/^\n+/, "");
}
