// src/lib/ai/explainPractice.ts
type Input = {
  mode: "concept" | "hint";
  title: string;
  prompt: string;
  kind: string;
  topicSlug: string;
  userAnswer: any | null;
};

function fallbackShort(input: Input): string {
  if (input.mode === "concept") {
    return "Focus on the method, not the final result. Identify the input, the operation, and the required output.";
  }

  return "Check the next step only. Convert values first if needed, then apply the rule or formula carefully.";
}

function stringifyUserAnswer(value: unknown): string {
  if (value == null) return "";
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
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

  const sentences = clean.match(/[^.!?\n]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const short = sentences.slice(0, 2).join(" ").trim();

  if (!short) {
    return clean.slice(0, maxChars).trim();
  }

  if (short.length <= maxChars) return short;

  return short.slice(0, maxChars).replace(/\s+\S*$/, "").trim() + "…";
}

function looksLikeReveal(text: string): boolean {
  const s = text.toLowerCase();

  return [
    "the answer is",
    "correct answer",
    "choose option",
    "pick option",
    "option a",
    "option b",
    "option c",
    "option d",
    "the correct option",
    "final answer",
    "solution is",
    "use this exact code",
    "here is the code",
  ].some((needle) => s.includes(needle));
}

function sanitizeAiText(text: string, input: Input): string {
  const short = limitToShortResponse(text, input.mode === "concept" ? 220 : 160);

  if (!short) return fallbackShort(input);
  if (looksLikeReveal(short)) return fallbackShort(input);

  return short;
}

export async function explainPracticeConcept(input: Input): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  if (!apiKey) {
    return fallbackShort(input);
  }

  const system = [
    "You are a tutor inside a practice app.",
    "Your job is to give a very short nudge, not a full explanation.",
    "Return at most 2 short sentences.",
    "Be supportive and direct.",
    "Do NOT give the final answer.",
    "Do NOT solve the exact prompt.",
    "Do NOT compute results for the given values.",
    "Do NOT reveal the correct option, option letter, option id, or exact code solution.",
    "Do NOT output step-by-step full solutions.",
    "Only give a tiny conceptual hint or the next thing to check.",
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
        ? `\nUser attempt:\n${stringifyUserAnswer(input.userAnswer)}`
        : "",
    "",
    "Reply very briefly. No bullets unless absolutely necessary.",
  ]
      .filter(Boolean)
      .join("\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 120,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const text = await r.text();
  let data: any = null;

  try {
    data = JSON.parse(text);
  } catch {
    return fallbackShort(input);
  }

  if (!r.ok) {
    return fallbackShort(input);
  }

  const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
  return sanitizeAiText(content, input);
}