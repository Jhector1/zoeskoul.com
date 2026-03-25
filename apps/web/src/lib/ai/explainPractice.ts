// src/lib/ai/explainPractice.ts
type Input = {
  mode: "concept" | "hint";
  title: string;
  prompt: string;
  kind: string;
  topicSlug: string;
  userAnswer: any | null;
};

export async function explainPracticeConcept(input: Input): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  // Fallback if no AI key yet
  if (!apiKey) {
    return [
      `**Concept explanation (${input.topicSlug})**`,
      ``,
      `I can explain the approach here, but \`OPENAI_API_KEY\` is not set on the server.`,
      ``,
      `**How to study this type:**`,
      `- Identify what the question is asking (kind: \`${input.kind}\`)`,
      `- Write the general method (definitions / steps)`,
      `- Only then plug numbers in (don’t do that in the explanation)`,
    ].join("\n");
  }

  const system = [
    "You are a tutor inside a practice app.",
    "Explain the underlying concept and the general approach.",
    "DO NOT give the final answer or compute results for the specific numbers in the prompt.",
    "DO NOT identify the correct option letter/id for multiple choice.",
    "You may point out common mistakes and what to check.",
    "Use concise bullet points and (when helpful) small generic examples that are NOT the same as the prompt.",
  ].join(" ");

  const user = [
    `Mode: ${input.mode}`,
    `Topic: ${input.topicSlug}`,
    `Kind: ${input.kind}`,
    `Title: ${input.title}`,
    "",
    "Question prompt:",
    input.prompt,
    "",
    input.userAnswer
      ? `User attempt (may be wrong):\n${JSON.stringify(input.userAnswer).slice(0, 1500)}`
      : "",
  ].filter(Boolean).join("\n");

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 450,
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
    throw new Error(`AI returned non-JSON (${r.status}): ${text.slice(0, 180)}`);
  }

  if (!r.ok) {
    throw new Error(data?.error?.message ?? `AI error (${r.status})`);
  }

  const content = data?.choices?.[0]?.message?.content;
  return String(content ?? "").trim() || "No explanation returned.";
}
