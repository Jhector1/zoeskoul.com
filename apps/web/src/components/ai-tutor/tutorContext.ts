import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";
import { buildSubmitAnswerFromItem } from "@/lib/practice/uiHelpers";
import { hasReachedAiTutorFailureThreshold } from "@/lib/practice/aiTutorPolicy";

type UnknownRecord = Record<string, unknown>;

export type AiTutorFailureContext = {
  attemptCount: number;
  feedbackTitle: string | null;
  feedbackMessage: string | null;
  explanation: string | null;
  runtimeError: string | null;
  terminal: {
    commands: string[];
    outputText: string;
    cwd: string | null;
  } | null;
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function shortText(value: unknown, max = 1800): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, max);
}

function firstText(values: unknown[], max?: number) {
  for (const value of values) {
    const text = shortText(value, max);
    if (text) return text;
  }
  return null;
}

export function shouldOfferAiTutor(current: QItem | null | undefined) {
  if (!current) return false;
  if (!hasReachedAiTutorFailureThreshold(current.attempts)) return false;
  if (current.result?.ok !== false) return false;
  if (current.revealed || (current.result as any)?.revealUsed) return false;
  return true;
}

export function buildAiTutorFailureContext(
  current: QItem,
): AiTutorFailureContext {
  const result = record(current.result) ?? {};
  const feedback = record(result.feedback);
  const terminalEvidence = record(current.terminalEvidence);
  const commands = Array.isArray(terminalEvidence?.commands)
    ? terminalEvidence.commands
        .filter((entry): entry is string => typeof entry === "string")
        .slice(-8)
        .map((entry) => entry.slice(0, 300))
    : [];

  const outputText = firstText(
    [terminalEvidence?.outputText, result.stderr, result.output, result.raw],
    2400,
  );

  return {
    attemptCount: current.attempts ?? 0,
    feedbackTitle: firstText([feedback?.title, result.title], 240),
    feedbackMessage: firstText(
      [feedback?.message, result.message, result.error],
      1800,
    ),
    explanation: firstText([result.explanation], 1800),
    runtimeError: firstText(
      [result.runtimeError, result.stderr, result.error],
      1800,
    ),
    terminal:
      commands.length || outputText
        ? {
            commands,
            outputText: outputText ?? "",
            cwd: firstText([terminalEvidence?.cwd], 300),
          }
        : null,
  };
}

export function buildAiTutorUserAnswer(
  current: QItem,
  exercise: Exercise,
) {
  if (exercise.kind === "code_input") {
    return {
      kind: exercise.kind,
      language: current.codeLang ?? exercise.language ?? null,
      code: current.code?.slice(0, 12000) ?? "",
      stdin: (current.codeStdin ?? current.stdin ?? "").slice(0, 2000),
      runOutput: current.codeRunOutput?.slice(-4000) ?? null,
      terminalEvidence: current.terminalEvidence
        ? {
            commands: current.terminalEvidence.commands?.slice(-8) ?? [],
            outputText: current.terminalEvidence.outputText?.slice(-3000) ?? "",
            cwd: current.terminalEvidence.cwd ?? null,
          }
        : null,
    };
  }

  return buildSubmitAnswerFromItem(current) ?? null;
}
