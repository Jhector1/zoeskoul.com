import "server-only";

import type { PublishedChallengeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";

import { resolvePublicChallengeCopyContext } from "./publicChallengeCopyContext";
import type { PublicChallengeCopyContext } from "./publicChallengeCopyContextTypes";

export const PUBLIC_CHALLENGE_AI_TITLE_MAX = 72;
export const PUBLIC_CHALLENGE_AI_PROMPT_MAX = 320;

type PublicChallengeCopy = { title: string; prompt: string; source: "ai" | "fallback" };
type OpenAiResponsePayload = {
  error?: { message?: string };
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function oneLine(value: unknown) { return text(value).replace(/\s+/g, " ").trim(); }
function clip(value: string, max: number) {
  if (value.length <= max) return value;
  const clipped = value.slice(0, max - 1);
  const space = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, space > max * 0.65 ? space : clipped.length).trimEnd()}…`;
}
function comparable(value: string) {
  return value.toLowerCase().replace(/[`'"_*]/g, "").replace(/\s+/g, " ").trim();
}
function fallbackTitle(value: string, key: string) {
  const clean = oneLine(value).replace(/^practice\s*:\s*/i, "").replace(/^practice\s+/i, "").trim();
  return clip(clean || key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), PUBLIC_CHALLENGE_AI_TITLE_MAX);
}
function fallbackPrompt(context: PublicChallengeCopyContext) {
  const task = oneLine(context.exercise.originalPrompt) || "Complete the requested challenge and verify the result.";
  const lead = [context.storyFrame.fallbackLead, context.technicalFallbackLead].filter(Boolean).join(" ");
  return clip(lead ? `${lead} ${task}` : task, PUBLIC_CHALLENGE_AI_PROMPT_MAX);
}
function openAiEnabled() {
  const flag = String(process.env.ZOESKOUL_PUBLIC_CHALLENGE_AI_COPY_ENABLED ?? "true").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(flag) && Boolean(process.env.OPENAI_API_KEY?.trim());
}
function model() {
  return process.env.ZOESKOUL_PUBLIC_CHALLENGE_AI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
}
function baseUrl() {
  return process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") || "https://api.openai.com/v1";
}
function outputText(payload: OpenAiResponsePayload) {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && text(content.text)) return text(content.text);
    }
  }
  return "";
}
function parseJson(value: string) {
  return JSON.parse(value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()) as unknown;
}
function validate(candidate: unknown, context: PublicChallengeCopyContext) {
  const object = record(candidate);
  const title = oneLine(object?.title);
  const prompt = oneLine(object?.prompt);
  if (title.length < 8 || title.length > 72 || prompt.length < 36 || prompt.length > 320) return null;
  if (title.includes("```") || prompt.includes("```") || /(?:^|\s)(?:solution|answer)\s*:/i.test(prompt)) return null;
  const copy = comparable(`${title} ${prompt}`);
  for (const fact of context.requiredFacts) {
    const required = comparable(fact);
    if (required && !copy.includes(required)) return null;
  }
  const privateSolution = oneLine(context.privateSolutionContext);
  if (privateSolution.length >= 24 && comparable(prompt).includes(comparable(privateSolution))) return null;
  return { title, prompt, source: "ai" as const };
}

async function requestAi(context: PublicChallengeCopyContext) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const instructions = [
    "You edit public ZoeSkoul learning-challenge copy.",
    "The supplied exercise context is private. Use it only to remove ambiguity; never reveal a complete executable solution.",
    "Return ONLY JSON with exactly two string fields: title and prompt.",
    "Title: 4-9 clear learner-friendly words, at most 72 characters.",
    "Prompt: one compact story-based challenge in 1-2 short sentences, at most 320 characters.",
    "Use storyFrame as inspiration, not text to copy verbatim.",
    "Vary openings across challenges: role-first, problem-first, mission-first, teammate request, release check, support issue, operations task.",
    "Do NOT repeatedly start with 'Imagine you are'. Use that phrasing only occasionally when it naturally fits.",
    "You may invent only harmless fictional workplace context. Never invent technical resources, identifiers, values, files, APIs, requirements, ordering, or expected results.",
    "Do not invent real company or brand names.",
    "Preserve every requiredFact and all required technical meaning.",
    "Do not include markdown fences, code blocks, or the final solution.",
    "The same copy is used on the homepage, social media, and email, so keep it concise and natural.",
  ].join("\n");

  try {
    const response = await fetch(`${baseUrl()}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY?.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model(),
        instructions,
        input: JSON.stringify({
          requiredFacts: context.requiredFacts,
          storyFrame: context.storyFrame,
          exerciseContext: context,
        }, null, 2),
        max_output_tokens: 400,
        store: false,
      }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as OpenAiResponsePayload | null;
    if (!response.ok || !payload) throw new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}.`);
    const value = outputText(payload);
    if (!value) throw new Error("OpenAI returned no challenge-copy text.");
    return parseJson(value);
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveAutomatedPublicChallengeCopy(args: {
  locale: string;
  option: PublishedChallengeExerciseOption;
}): Promise<PublicChallengeCopy> {
  let context: PublicChallengeCopyContext;
  try {
    context = await resolvePublicChallengeCopyContext(args);
  } catch (error) {
    console.warn("[public-challenge-ai-copy] context resolution failed; using authored fallback", error instanceof Error ? error.message : error);
    return {
      title: fallbackTitle(args.option.exerciseTitle, args.option.exerciseKey),
      prompt: clip(oneLine(args.option.exercisePrompt) || "Complete the requested challenge and verify the result.", 320),
      source: "fallback",
    };
  }

  const fallback: PublicChallengeCopy = {
    title: fallbackTitle(context.exercise.originalTitle, args.option.exerciseKey),
    prompt: fallbackPrompt(context),
    source: "fallback",
  };
  if (!openAiEnabled()) return fallback;

  try {
    return validate(await requestAi(context), context) ?? fallback;
  } catch (error) {
    console.warn("[public-challenge-ai-copy] AI polish failed; using deterministic fallback", error instanceof Error ? error.message : error);
    return fallback;
  }
}
