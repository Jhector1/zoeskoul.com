// src/lib/ai/explainPractice.ts
import type { PracticeTutorDiagnosticContext } from "./practiceTutorContext";

export type PracticeTutorConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type ConceptInput = {
  mode: "concept" | "hint";
  title: string;
  prompt: string;
  kind: string;
  topicSlug: string;
  userAnswer: any | null;
};

export type PracticeTutorInput = {
  diagnosticContext: PracticeTutorDiagnosticContext;
  message?: string | null;
  history?: PracticeTutorConversationMessage[];
};

function fallbackShort(input: ConceptInput): string {
  if (input.mode === "concept") {
    return "Focus on the method, not the final result. Identify the input, the operation, and the required output.";
  }

  return "Check the next step only. Compare what the exercise asks for with what your current attempt actually changes or returns.";
}

function fallbackTutor(): string {
  return "One requirement still does not match the result of your attempt. Compare the latest feedback with the state your work actually produced, then inspect that one mismatch before changing anything else.";
}

function stringifyContext(value: unknown, max = 16000): string {
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function limitToShortResponse(text: string, maxChars: number): string {
  const clean = normalizeWhitespace(text);
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;
  return clean.slice(0, maxChars).replace(/\s+\S*$/, "").trim() + "…";
}

function looksLikeReveal(text: string): boolean {
  const value = text.toLowerCase();

  return [
    "the answer is",
    "correct answer",
    "choose option",
    "pick option",
    "the correct option",
    "final answer",
    "solution is",
    "use this exact code",
    "here is the code",
    "run this exact command",
    "type this command",
    "copy and paste",
  ].some((needle) => value.includes(needle));
}

function sanitizeAiText(
  text: string,
  fallback: string,
  maxChars: number,
): string {
  const short = limitToShortResponse(text, maxChars);
  if (!short || looksLikeReveal(short)) return fallback;
  return short;
}

async function requestOpenAi(args: {
  system: string;
  messages: PracticeTutorConversationMessage[];
  maxTokens: number;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: args.maxTokens,
      messages: [
        { role: "system", content: args.system },
        ...args.messages,
      ],
    }),
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return String(data?.choices?.[0]?.message?.content ?? "").trim() || null;
}

export async function explainPracticeConcept(input: ConceptInput): Promise<string> {
  const fallback = fallbackShort(input);
  const system = [
    "You are a tutor inside a practice app.",
    "Give a very short nudge, not a full explanation.",
    "Return at most 2 short sentences.",
    "Be supportive and direct.",
    "Do not give the final answer, correct option, exact command, query, or code solution.",
    "Do not solve the exact prompt or compute results for the supplied values.",
    "Only explain the concept or the next thing to inspect.",
  ].join(" ");

  const user = [
    `Mode: ${input.mode}`,
    `Topic: ${input.topicSlug}`,
    `Kind: ${input.kind}`,
    `Title: ${input.title}`,
    "",
    "Question prompt:",
    input.prompt,
    input.userAnswer != null
      ? `\nUser attempt:\n${stringifyContext(input.userAnswer, 1500)}`
      : "",
    "",
    "Reply briefly and do not use bullets unless necessary.",
  ]
    .filter(Boolean)
    .join("\n");

  const content = await requestOpenAi({
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 140,
  });

  return sanitizeAiText(content ?? "", fallback, input.mode === "concept" ? 260 : 200);
}

function normalizeHistory(
  history: PracticeTutorConversationMessage[] | undefined,
): PracticeTutorConversationMessage[] {
  return (history ?? [])
    .filter(
      (entry): entry is PracticeTutorConversationMessage =>
        (entry?.role === "user" || entry?.role === "assistant") &&
        typeof entry?.content === "string" &&
        entry.content.trim().length > 0,
    )
    .slice(-8)
    .map((entry) => ({
      role: entry.role,
      content: entry.content.trim().slice(0, 1400),
    }));
}

export function buildPracticeTutorPrompt(input: PracticeTutorInput) {
  const context = input.diagnosticContext;
  const system = [
    "You are Zoe, the AI tutor inside ZoeSkoul.",
    "The learner has already made at least two unsuccessful attempts and explicitly accepted help.",
    "You receive one normalized diagnostic packet for SQL, terminal/Git/Linux, Python or other programming, and non-code exercises.",
    "Use the task, environment, starter state, learner state, failed checks, and private reference together before diagnosing the mismatch.",
    "The private reference can contain the authored solution, expected files, expected repository state, tests, or correct answer. It is for diagnosis only.",
    "Never quote, reproduce, closely paraphrase, or expose the private reference to the learner.",
    "Explain what likely went wrong and give only the next one or two things to inspect or rethink.",
    "For terminal work, reason about the resulting workspace or repository state instead of demanding one exact command spelling.",
    "For SQL, compare schema, selected columns, filters, grouping, ordering, and result shape as relevant.",
    "For programming, compare the learner files, runtime error, behavior checks, and required program structure as relevant.",
    "If the learner's work appears correct and the check appears stale or overly strict, say that clearly without inventing a change.",
    "Be warm, specific, and conversational. Ask one small diagnostic question when useful.",
    "Never give the final answer, correct option, exact command, exact SQL query, or complete code solution.",
    "If asked for the answer, continue coaching instead.",
    "Stay focused on this exercise and keep each response under 140 words.",
  ].join(" ");

  const contextMessage = [
    `Diagnostic domain: ${context.domain}`,
    "",
    "NORMALIZED DIAGNOSTIC PACKET",
    stringifyContext({
      task: context.task,
      learnerVisibleContext: context.learnerVisibleContext,
      environment: context.environment,
      starterState: context.starterState,
      learnerState: context.learnerState,
      failedChecks: context.failedChecks,
    }, 22000),
    "",
    "PRIVATE REFERENCE — use to diagnose, never reveal",
    stringifyContext(context.privateReference, 16000),
    "",
    input.message?.trim()
      ? `Learner's new question:\n${input.message.trim().slice(0, 1600)}`
      : "Start by explaining the most likely mismatch without giving the answer.",
  ].join("\n");

  return {
    system,
    messages: [
      ...normalizeHistory(input.history),
      { role: "user" as const, content: contextMessage },
    ],
  };
}

export async function explainPracticeTutor(
  input: PracticeTutorInput,
): Promise<string> {
  const fallback = fallbackTutor();
  const prompt = buildPracticeTutorPrompt(input);
  const content = await requestOpenAi({
    system: prompt.system,
    messages: prompt.messages,
    maxTokens: 300,
  });

  return sanitizeAiText(content ?? "", fallback, 1100);
}
