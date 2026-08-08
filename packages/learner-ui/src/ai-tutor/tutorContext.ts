import type { Exercise } from "@zoeskoul/practice-contracts";
import type { QItem } from "@zoeskoul/practice-contracts";

type UnknownRecord = Record<string, unknown>;

function hasReachedAiTutorFailureThreshold(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.floor(parsed) >= 2;
}

function buildSubmitAnswerFromItem(item: QItem): unknown {
  const kind = item.exercise.kind;
  if (kind === "text_input" || kind === "listen_build" || kind === "word_bank_arrange") {
    const value = String(item.text ?? "").trim();
    return value ? { kind, value } : undefined;
  }
  if (kind === "fill_blank_choice") {
    const value = String(item.text ?? item.single ?? "").trim();
    return value ? { kind, value } : undefined;
  }
  if (kind === "single_choice") return item.single ? { kind, optionId: item.single } : undefined;
  if (kind === "multi_choice") return item.multi?.length ? { kind, optionIds: item.multi } : undefined;
  if (kind === "numeric") {
    const value = Number(item.num);
    return item.num?.trim() && Number.isFinite(value) ? { kind, value } : undefined;
  }
  if (kind === "vector_drag_target") return { kind, a: { ...item.dragA }, b: { ...item.dragB } };
  if (kind === "vector_drag_dot") return { kind, a: { ...item.dragA } };
  if (kind === "voice_input") {
    const transcript = String(item.voiceTranscript ?? "").trim();
    return transcript ? { kind, transcript, ...(item.voiceAudioId ? { audioId: item.voiceAudioId } : {}) } : undefined;
  }
  if (kind === "drag_reorder") {
    const order = item.reorder ?? item.reorderIds ?? [];
    return order.length ? { kind, order } : undefined;
  }
  if (kind === "matrix_input") {
    const values = item.mat.map((row) => row.map(Number));
    return values.flat().every(Number.isFinite) ? { kind, values } : undefined;
  }
  return undefined;
}

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
