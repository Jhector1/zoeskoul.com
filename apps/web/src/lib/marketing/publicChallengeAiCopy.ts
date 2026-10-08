import "server-only";

import { resolveManifestExercise } from "@zoeskoul/curriculum-runtime/curriculum/resolveManifestExercise";
import { getSqlDataset } from "@zoeskoul/curriculum-runtime/subjects/sql/sql/datasets";

import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";
import type { PublishedChallengeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";

export const PUBLIC_CHALLENGE_AI_TITLE_MAX = 72;
export const PUBLIC_CHALLENGE_AI_PROMPT_MAX = 320;

type PublicChallengeCopy = {
  title: string;
  prompt: string;
  source: "ai" | "fallback";
};

type CopyContext = {
  locale: string;
  language: string | null;
  dialect: string | null;
  catalog: string;
  subject: string;
  module: string;
  section: string;
  topic: string;
  exerciseKind: string;
  exercisePurpose: string;
  originalTitle: string;
  originalPrompt: string;
  starterCode: string | null;
  checkSql: string | null;
  privateSolutionCode: string | null;
  validation: unknown;
  semanticChecks: unknown;
  tests: unknown;
  dataset: null | {
    id: string;
    dialect: string;
    schemaSql: string;
    tables: Array<{
      name: string;
      columns: Array<{ name: string; type: string }>;
      rows: unknown[][];
    }>;
  };
};

type OpenAiResponsePayload = {
  error?: { message?: string };
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function oneLine(value: unknown) {
  return text(value).replace(/\s+/g, " ").trim();
}

function clip(value: string, max: number) {
  if (value.length <= max) return value;

  const clipped = value.slice(0, max - 1);
  const sentence = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("? "),
    clipped.lastIndexOf("! "),
  );
  const space = clipped.lastIndexOf(" ");
  const cut =
    sentence >= Math.floor(max * 0.58)
      ? sentence + 1
      : space >= Math.floor(max * 0.7)
        ? space
        : clipped.length;

  return `${clipped.slice(0, cut).trimEnd()}…`;
}

async function resolveTaggedText(
  value: unknown,
  locale: string,
) {
  const raw = text(value);
  if (!raw) return "";
  if (!raw.startsWith("@:")) return raw;

  const key = raw.slice(2).trim();
  if (!key) return "";

  try {
    const { getTranslations } = await import("next-intl/server");
    const t = await getTranslations({
      locale:
        locale === "fr" || locale === "ht"
          ? locale
          : "en",
    });
    const resolved = t(key as any);
    const normalized = text(resolved);
    return normalized && normalized !== key ? normalized : "";
  } catch {
    return "";
  }
}

function firstRecordString(
  candidates: Array<Record<string, unknown> | null>,
  key: string,
) {
  for (const candidate of candidates) {
    const value = text(candidate?.[key]);
    if (value) return value;
  }
  return "";
}

function firstRecordValue(
  candidates: Array<Record<string, unknown> | null>,
  key: string,
) {
  for (const candidate of candidates) {
    if (candidate && candidate[key] !== undefined) {
      return candidate[key];
    }
  }
  return null;
}

function compactPrivateValue(value: unknown) {
  if (value === null || value === undefined) return null;
  try {
    const json = JSON.stringify(value);
    return json.length <= 4_000
      ? value
      : `${json.slice(0, 3_999)}…`;
  } catch {
    return null;
  }
}

async function buildCopyContext(args: {
  locale: string;
  option: PublishedChallengeExerciseOption;
}): Promise<CopyContext> {
  const topicBundle = resolveTopicBundleManifest({
    subjectSlug: args.option.subjectSlug,
    topicSlugOrId: args.option.topicSlug,
  });

  if (!topicBundle) {
    throw new Error(
      `Published topic "${args.option.topicSlug}" is unavailable.`,
    );
  }

  const exercise = resolveManifestExercise({
    topicBundle,
    exerciseKey: args.option.exerciseKey,
  }) as Record<string, unknown>;

  const bundle = topicBundle as unknown as Record<string, unknown>;
  const runtime = record(exercise.runtime);
  const workspace = record(exercise.workspace);
  const recipe = record(exercise.recipe);
  const runtimeDefaults = record(bundle.runtimeDefaults);

  const messageBase = text(exercise.messageBase);
  const titleReference =
    text(exercise.title) ||
    text(exercise.titleKey) ||
    (messageBase ? `@:${messageBase}.title` : "");
  const promptReference =
    text(args.option.exercisePrompt) ||
    text(exercise.prompt) ||
    text(exercise.promptKey) ||
    (messageBase ? `@:${messageBase}.prompt` : "");

  const originalTitle =
    (await resolveTaggedText(titleReference, args.locale)) ||
    args.option.exerciseTitle;
  const originalPrompt =
    (await resolveTaggedText(promptReference, args.locale)) ||
    args.option.exercisePrompt ||
    "";

  const starterReference = firstRecordString(
    [workspace, exercise],
    "starterCode",
  );
  const solutionReference = firstRecordString(
    [recipe, exercise],
    "solutionCode",
  );
  const checkSql = firstRecordString(
    [recipe, exercise],
    "checkSql",
  );

  const starterCode =
    (await resolveTaggedText(starterReference, args.locale)) ||
    starterReference ||
    null;
  const privateSolutionCode =
    (await resolveTaggedText(solutionReference, args.locale)) ||
    solutionReference ||
    null;

  const datasetId = firstRecordString(
    [recipe, runtime, runtimeDefaults],
    "datasetId",
  );
  const dataset = datasetId ? getSqlDataset(datasetId) : null;

  const language =
    firstRecordString([workspace, exercise, runtimeDefaults], "language") ||
    (String(runtime?.kind ?? "") === "sql" ? "sql" : "") ||
    null;
  const dialect =
    firstRecordString(
      [exercise, runtime, runtimeDefaults],
      "fixedSqlDialect",
    ) ||
    dataset?.dialect ||
    null;

  return {
    locale: args.locale,
    language,
    dialect,
    catalog: `${args.option.catalogTitle} (${args.option.catalogSlug})`,
    subject: `${args.option.subjectTitle} (${args.option.subjectSlug})`,
    module: `${args.option.moduleTitle} (${args.option.moduleSlug})`,
    section: `${args.option.sectionTitle} (${args.option.sectionSlug})`,
    topic: `${args.option.topicTitle} (${args.option.topicSlug})`,
    exerciseKind: args.option.exerciseKind,
    exercisePurpose: args.option.exercisePurpose,
    originalTitle: oneLine(originalTitle),
    originalPrompt: oneLine(originalPrompt),
    starterCode: starterCode ? clip(starterCode, 2_000) : null,
    checkSql: checkSql ? clip(checkSql, 2_000) : null,
    privateSolutionCode: privateSolutionCode
      ? clip(privateSolutionCode, 4_000)
      : null,
    validation: compactPrivateValue(
      firstRecordValue([exercise, recipe], "validation"),
    ),
    semanticChecks: compactPrivateValue(
      firstRecordValue([exercise, recipe], "semanticChecks"),
    ),
    tests: compactPrivateValue(
      firstRecordValue([exercise, recipe], "tests"),
    ),
    dataset: dataset
      ? {
          id: dataset.id,
          dialect: dataset.dialect,
          schemaSql: clip(dataset.schemaSql, 5_000),
          tables: Object.values(dataset.tableSnapshots).map((table) => ({
            name: table.name,
            columns: table.columns.map((column) => ({
              name: column.name,
              type: column.type,
            })),
            rows: table.rows
              .slice(0, 8)
              .map((row) => [...row]),
          })),
        }
      : null,
  };
}

function normalizeComparable(value: string) {
  return value
    .toLowerCase()
    .replace(/[`'"_*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsWord(haystack: string, needle: string) {
  return new RegExp(
    `(^|[^a-z0-9_])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9_]|$)`,
    "i",
  ).test(haystack);
}

function extractRequiredFacts(context: CopyContext) {
  const facts = new Set<string>();
  const original = `${context.originalTitle} ${context.originalPrompt}`;
  const privateSql = [
    context.originalPrompt,
    context.checkSql ?? "",
    context.privateSolutionCode ?? "",
  ].join("\n");

  for (const match of context.originalPrompt.matchAll(/`([^`]{1,80})`/g)) {
    const token = match[1]?.trim();
    if (!token) continue;

    for (const part of token.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?/g) ?? []) {
      if (part.length >= 2 || /^\d/.test(part)) {
        facts.add(part);
      }
    }
  }

  for (const match of context.originalPrompt.matchAll(
    /["']([^"'\\]{1,80})["']/g,
  )) {
    const literal = match[1]?.trim();
    if (literal) facts.add(literal);
  }

  for (const number of context.originalPrompt.match(/\b\d+(?:\.\d+)?\b/g) ?? []) {
    facts.add(number);
  }

  for (const operation of ["SELECT", "UPDATE", "INSERT", "DELETE"]) {
    if (new RegExp(`\\b${operation}\\b`, "i").test(privateSql)) {
      facts.add(operation);
    }
  }

  if (context.dataset) {
    const tables = context.dataset.tables;
    const referencedTables = tables.filter((table) =>
      containsWord(privateSql, table.name),
    );

    const requiredTables =
      referencedTables.length > 0
        ? referencedTables
        : tables.length === 1
          ? tables
          : [];

    for (const table of requiredTables) {
      facts.add(table.name);
      for (const column of table.columns) {
        if (
          containsWord(context.originalPrompt, column.name) ||
          containsWord(context.checkSql ?? "", column.name)
        ) {
          facts.add(column.name);
        }
      }
    }
  }

  // Do not force generic prose words into the semantic guard.
  for (const generic of [
    "row",
    "rows",
    "table",
    "query",
    "practice",
    "preview",
    "verify",
    "verification",
  ]) {
    facts.delete(generic);
    facts.delete(generic.toUpperCase());
  }

  return [...facts].slice(0, 24);
}

function titleFallback(value: string, exerciseKey: string) {
  const cleaned = oneLine(value)
    .replace(/^practice\s*:\s*/i, "")
    .replace(/^practice\s+/i, "")
    .replace(/\b(?:id|row)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const base =
    cleaned ||
    exerciseKey
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return clip(base, PUBLIC_CHALLENGE_AI_TITLE_MAX);
}

function deterministicPrompt(
  context: CopyContext,
) {
  let prompt = oneLine(context.originalPrompt);

  if (!prompt) {
    prompt = "Complete the requested coding challenge and verify the result.";
  }

  if (context.dataset?.tables.length === 1) {
    const table = context.dataset.tables[0]!;
    if (!containsWord(prompt, table.name)) {
      const first = prompt.charAt(0).toLowerCase() + prompt.slice(1);
      prompt = `In the ${table.name} table, ${first}`;
    }
  }

  return clip(prompt, PUBLIC_CHALLENGE_AI_PROMPT_MAX);
}

function fallbackCopy(
  context: CopyContext,
  exerciseKey: string,
): PublicChallengeCopy {
  return {
    title: titleFallback(context.originalTitle, exerciseKey),
    prompt: deterministicPrompt(context),
    source: "fallback",
  };
}

function openAiCopyEnabled() {
  const flag = String(
    process.env.ZOESKOUL_PUBLIC_CHALLENGE_AI_COPY_ENABLED ?? "true",
  )
    .trim()
    .toLowerCase();

  return (
    !["0", "false", "off", "no"].includes(flag) &&
    Boolean(process.env.OPENAI_API_KEY?.trim())
  );
}

function openAiModel() {
  return (
    process.env.ZOESKOUL_PUBLIC_CHALLENGE_AI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4.1-mini"
  );
}

function openAiBaseUrl() {
  return (
    process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") ||
    "https://api.openai.com/v1"
  );
}

function responseOutputText(payload: OpenAiResponsePayload) {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && text(content.text)) {
        return text(content.text);
      }
    }
  }
  return "";
}

function parseJsonObject(value: string) {
  const cleaned = value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned) as unknown;
}

function validAiCopy(args: {
  candidate: unknown;
  context: CopyContext;
  requiredFacts: string[];
}) {
  const candidate = record(args.candidate);
  const title = oneLine(candidate?.title);
  const prompt = oneLine(candidate?.prompt);

  if (
    title.length < 8 ||
    title.length > PUBLIC_CHALLENGE_AI_TITLE_MAX ||
    prompt.length < 24 ||
    prompt.length > PUBLIC_CHALLENGE_AI_PROMPT_MAX
  ) {
    return null;
  }

  if (
    title.includes("```") ||
    prompt.includes("```") ||
    /(?:^|\s)(?:solution|answer)\s*:/i.test(prompt) ||
    /;\s*(?:SELECT|UPDATE|INSERT|DELETE)\b/i.test(prompt)
  ) {
    return null;
  }

  const publicCopy = normalizeComparable(`${title} ${prompt}`);
  for (const fact of args.requiredFacts) {
    const normalizedFact = normalizeComparable(fact);
    if (normalizedFact && !publicCopy.includes(normalizedFact)) {
      return null;
    }
  }

  const privateSolution = oneLine(args.context.privateSolutionCode);
  if (
    privateSolution.length >= 24 &&
    normalizeComparable(prompt).includes(
      normalizeComparable(privateSolution),
    )
  ) {
    return null;
  }

  return {
    title,
    prompt,
    source: "ai" as const,
  };
}

async function requestAiCopy(args: {
  context: CopyContext;
  requiredFacts: string[];
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  const instructions = [
    "You edit public ZoeSkoul coding challenge copy.",
    "The exercise context is PRIVATE and may include solution code, validators, schema, and seed rows.",
    "Use that private context only to remove ambiguity. Never reveal a complete executable solution.",
    "Return ONLY a JSON object with exactly two string fields: title and prompt.",
    `title: 4-9 learner-friendly words, at most ${PUBLIC_CHALLENGE_AI_TITLE_MAX} characters, skill-focused, no internal IDs, no 'Practice:' prefix.`,
    `prompt: 1-2 short sentences, at most ${PUBLIC_CHALLENGE_AI_PROMPT_MAX} characters.`,
    "The prompt must tell the learner the exact table/object/file when needed, target row/value, requested change, and verification result when those are part of the authored exercise.",
    "Preserve every required fact exactly enough to remain recognizable.",
    "Do not invent tables, columns, values, files, APIs, requirements, or ordering.",
    "Do not include markdown fences, code blocks, full SQL statements, or final solution code.",
    "The same title/prompt will be used on the homepage, social media, and email, so keep it concise.",
  ].join("\n");

  const input = JSON.stringify(
    {
      requiredFacts: args.requiredFacts,
      exerciseContext: args.context,
    },
    null,
    2,
  );

  try {
    const response = await fetch(`${openAiBaseUrl()}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY?.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openAiModel(),
        instructions,
        input,
        max_output_tokens: 400,
        store: false,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | OpenAiResponsePayload
      | null;

    if (!response.ok || !payload) {
      throw new Error(
        payload?.error?.message ||
          `OpenAI returned HTTP ${response.status}.`,
      );
    }

    const output = responseOutputText(payload);
    if (!output) {
      throw new Error("OpenAI returned no challenge-copy text.");
    }

    return parseJsonObject(output);
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveAutomatedPublicChallengeCopy(args: {
  locale: string;
  option: PublishedChallengeExerciseOption;
}): Promise<PublicChallengeCopy> {
  let context: CopyContext;

  try {
    context = await buildCopyContext(args);
  } catch (error) {
    console.warn(
      "[public-challenge-ai-copy] context resolution failed; using authored fallback",
      error instanceof Error ? error.message : error,
    );

    return {
      title: titleFallback(
        args.option.exerciseTitle,
        args.option.exerciseKey,
      ),
      prompt: clip(
        oneLine(args.option.exercisePrompt) ||
          "Complete the requested coding challenge and verify the result.",
        PUBLIC_CHALLENGE_AI_PROMPT_MAX,
      ),
      source: "fallback",
    };
  }

  const fallback = fallbackCopy(
    context,
    args.option.exerciseKey,
  );

  if (!openAiCopyEnabled()) {
    return fallback;
  }

  const requiredFacts = extractRequiredFacts(context);

  try {
    const rawCandidate = await requestAiCopy({
      context,
      requiredFacts,
    });
    return (
      validAiCopy({
        candidate: rawCandidate,
        context,
        requiredFacts,
      }) ?? fallback
    );
  } catch (error) {
    console.warn(
      "[public-challenge-ai-copy] AI polish failed; using deterministic fallback",
      error instanceof Error ? error.message : error,
    );
    return fallback;
  }
}
