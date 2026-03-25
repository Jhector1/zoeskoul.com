import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "../practiceType";

function parseNumOrNull(v: unknown): number | null {
  const s = typeof v === "string" ? v.trim() : v;
  if (s === "" || s === null || s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Return ONLY the user's current input (no expected/correct answers).
export function pickAnswerForAI(current: QItem, exercise: Exercise) {
  switch (exercise.kind) {
    case "single_choice":
      return { kind: "single_choice", optionId: current.single ?? null };

    case "multi_choice":
      return { kind: "multi_choice", optionIds: current.multi ?? [] };

    case "numeric":
      return { kind: "numeric", value: parseNumOrNull(current.num) };

    case "vector_drag_target":
      return {
        kind: "vector_drag_target",
        a: current.dragA ?? null,
        b: current.dragB ?? null,
      };

    case "vector_drag_dot":
      return { kind: "vector_drag_dot", a: current.dragA ?? null };

    case "matrix_input": {
      const raw = current.mat ?? [];
      const values = raw.map((row) => row.map((cell) => parseNumOrNull(cell)));
      return { kind: "matrix_input", values, raw };
    }

    case "code_input":
      return {
        kind: "code_input",
        language: (current.codeLang ?? (exercise as any).language ?? "python") as any,
        code: current.code ?? "",
        stdin: current.codeStdin ?? "",
      };

    default:
      return null;
  }
}

export function normalizeAiMath(md?: string | null) {
  const s = String(md ?? "");
  return s
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");
}
