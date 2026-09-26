import "server-only";

import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";

import {
  deriveEntryCode,
  resolveExerciseWorkspace,
} from "@zoeskoul/learning-runtime/review/module/runtime/exerciseWorkspaceResolver";
import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";

import {
  destroyCloudinaryImage,
  uploadChallengeOgImage,
} from "@/lib/cloudinary/server";
import { resolveManifestExercise } from "@zoeskoul/curriculum-runtime/curriculum/resolveManifestExercise";
import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";
import { prisma } from "@/lib/prisma";

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_LINES = 13;
const MAX_COLUMNS = 88;

type RecordValue = Record<string, unknown>;

export type PublicChallengeSocialImageSource = {
  id: string;
  locale: string;
  subjectSlug: string;
  topicSlug: string;
  exerciseKey: string;
  shareTitle: string | null;
  ogImagePublicId: string | null;
  ogImageAlt: string | null;
};

type CardTarget = {
  locale: string;
  subjectSlug: string;
  topicSlug: string;
  exerciseKey: string;
  shareTitle?: string | null;
};

export type PublicChallengeSocialCardModel = {
  title: string;
  language: string;
  entryPath: string;
  code: string;
  lines: string[];
  truncated: boolean;
  imageAlt: string;
};

function object(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

function languageFor(exercise: RecordValue, topicBundle: RecordValue) {
  const workspace = object(exercise.workspace);
  const runtimeDefaults = object(topicBundle.runtimeDefaults);

  return (
    String(
      workspace.language ??
        exercise.fixedLanguage ??
        exercise.language ??
        runtimeDefaults.language ??
        "python",
    ).trim() || "python"
  );
}

function pathForNode(
  workspace: WorkspaceStateV2,
  nodeId: string | null | undefined,
) {
  if (!nodeId) return "";

  const nodes = new Map(
    workspace.nodes.map((node) => [String(node.id), node]),
  );
  const visited = new Set<string>();
  const parts: string[] = [];
  let current: string | null = String(nodeId);

  while (current) {
    if (visited.has(current)) break;
    visited.add(current);

    const node = nodes.get(current);
    if (!node) break;

    if (node.name) parts.unshift(String(node.name));
    current =
      node.parentId === null || typeof node.parentId === "undefined"
        ? null
        : String(node.parentId);
  }

  return parts.join("/");
}

function fallbackTextFile(workspace: WorkspaceStateV2) {
  return workspace.nodes.find(
    (node) =>
      node.kind === "file" &&
      !Boolean((node as unknown as RecordValue).binary),
  );
}

type CodeToken = {
  text: string;
  color: string;
};

const CODE_COLORS = {
  text: "#e6efe9",
  comment: "#78a68c",
  keyword: "#c084fc",
  string: "#f6c85f",
  number: "#7aa2f7",
  builtin: "#7dcfff",
  operator: "#89ddff",
} as const;

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "False",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "None",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "True",
  "try",
  "while",
  "with",
  "yield",
]);

const PYTHON_BUILTINS = new Set([
  "bool",
  "dict",
  "enumerate",
  "float",
  "input",
  "int",
  "len",
  "list",
  "max",
  "min",
  "print",
  "range",
  "set",
  "str",
  "sum",
  "tuple",
  "zip",
]);

const JAVASCRIPT_KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "of",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const JAVASCRIPT_BUILTINS = new Set([
  "Array",
  "Boolean",
  "console",
  "Date",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "Promise",
  "Set",
  "String",
]);

const SQL_KEYWORDS = new Set([
  "ALL",
  "AND",
  "AS",
  "ASC",
  "BETWEEN",
  "BY",
  "CASE",
  "COUNT",
  "CREATE",
  "DELETE",
  "DESC",
  "DISTINCT",
  "ELSE",
  "END",
  "FROM",
  "FULL",
  "GROUP",
  "HAVING",
  "IN",
  "INNER",
  "INSERT",
  "INTO",
  "IS",
  "JOIN",
  "LEFT",
  "LIKE",
  "LIMIT",
  "MAX",
  "MIN",
  "NOT",
  "NULL",
  "ON",
  "OR",
  "ORDER",
  "OUTER",
  "RIGHT",
  "SELECT",
  "SET",
  "SUM",
  "THEN",
  "UNION",
  "UPDATE",
  "VALUES",
  "WHEN",
  "WHERE",
]);

function commentMarker(language: string) {
  const normalized = language.trim().toLowerCase();

  if (normalized === "sql") return "--";

  if (
    normalized === "javascript" ||
    normalized === "typescript" ||
    normalized === "java" ||
    normalized === "c" ||
    normalized === "cpp" ||
    normalized === "web"
  ) {
    return "//";
  }

  return "#";
}

function classifyWord(word: string, language: string) {
  const normalized = language.trim().toLowerCase();

  if (normalized === "python") {
    if (PYTHON_KEYWORDS.has(word)) return CODE_COLORS.keyword;
    if (PYTHON_BUILTINS.has(word)) return CODE_COLORS.builtin;
    return CODE_COLORS.text;
  }

  if (
    normalized === "javascript" ||
    normalized === "typescript" ||
    normalized === "web"
  ) {
    if (JAVASCRIPT_KEYWORDS.has(word)) return CODE_COLORS.keyword;
    if (JAVASCRIPT_BUILTINS.has(word)) return CODE_COLORS.builtin;
    return CODE_COLORS.text;
  }

  if (normalized === "sql") {
    return SQL_KEYWORDS.has(word.toUpperCase())
      ? CODE_COLORS.keyword
      : CODE_COLORS.text;
  }

  return CODE_COLORS.text;
}

export function highlightCodeLine(
  line: string,
  language: string,
): CodeToken[] {
  const tokens: CodeToken[] = [];
  const marker = commentMarker(language);
  let index = 0;

  const push = (text: string, color: string) => {
    if (!text) return;

    const previous = tokens.at(-1);

    if (previous?.color === color) {
      previous.text += text;
      return;
    }

    tokens.push({ text, color });
  };

  while (index < line.length) {
    if (line.startsWith(marker, index)) {
      push(line.slice(index), CODE_COLORS.comment);
      break;
    }

    const char = line[index];

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      let end = index + 1;
      let escaped = false;

      while (end < line.length) {
        const next = line[end];

        if (!escaped && next === quote) {
          end += 1;
          break;
        }

        if (!escaped && next === "\\") {
          escaped = true;
        } else {
          escaped = false;
        }

        end += 1;
      }

      push(line.slice(index, end), CODE_COLORS.string);
      index = end;
      continue;
    }

    const word =
      line.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];

    if (word) {
      push(word, classifyWord(word, language));
      index += word.length;
      continue;
    }

    const number =
      line
        .slice(index)
        .match(/^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)/)?.[0];

    if (number) {
      push(number, CODE_COLORS.number);
      index += number.length;
      continue;
    }

    if ("=+-*/%<>!&|^~".includes(char)) {
      push(char, CODE_COLORS.operator);
      index += 1;
      continue;
    }

    push(char, CODE_COLORS.text);
    index += 1;
  }

  return tokens.length > 0
    ? tokens
    : [{ text: " ", color: CODE_COLORS.text }];
}

function visibleLine(line: string) {
  const expanded = line.replace(/\t/g, "    ");
  return expanded.length <= MAX_COLUMNS
    ? expanded
    : `${expanded.slice(0, MAX_COLUMNS - 1)}…`;
}

export function formatPublicChallengeSocialCardCode(code: string) {
  const raw = String(code ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .split("\n");

  while (raw.length > 1 && raw.at(-1) === "") raw.pop();

  const truncated = raw.length > MAX_LINES;
  const lines = raw.slice(0, MAX_LINES).map(visibleLine);

  if (lines.length === 0) lines.push("");
  if (truncated) lines[MAX_LINES - 1] = "…";

  return { lines, truncated };
}

async function resolvePublicChallengeExerciseForLocale(
  exercise: RecordValue,
  locale: string,
) {
  const t = await getTranslations({ locale });

  const has =
    ((t as unknown as { has?: (key: string) => boolean }).has?.bind(t) as
      | ((key: string) => boolean)
      | undefined) ?? (() => false);

  const raw =
    ((t as unknown as { raw?: (key: string) => unknown }).raw?.bind(t) as
      | ((key: string) => unknown)
      | undefined) ?? null;

  return resolveDeepTagged(
    exercise,
    (key) => {
      const fallback = `@:${key}`;

      try {
        if (!raw || !has(key)) return fallback;
        return raw(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
  ) as RecordValue;
}

function hasUnresolvedTaggedValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trimStart().startsWith("@:");
  }

  if (Array.isArray(value)) {
    return value.some(hasUnresolvedTaggedValue);
  }

  if (value && typeof value === "object") {
    return Object.values(value as RecordValue).some(
      hasUnresolvedTaggedValue,
    );
  }

  return false;
}

export async function resolvePublicChallengeSocialCardModel(
  target: CardTarget,
): Promise<PublicChallengeSocialCardModel> {
  const topicBundle = resolveTopicBundleManifest({
    subjectSlug: target.subjectSlug,
    topicSlugOrId: target.topicSlug,
  });

  if (!topicBundle) {
    throw new Error(
      `Published topic "${target.topicSlug}" was not found for subject "${target.subjectSlug}".`,
    );
  }

  const authoredExercise = resolveManifestExercise({
    topicBundle,
    exerciseKey: target.exerciseKey,
  }) as RecordValue;

  const exercise = await resolvePublicChallengeExerciseForLocale(
    authoredExercise,
    target.locale,
  );

  const workspaceSource = object(exercise.workspace);

  if (
    hasUnresolvedTaggedValue(exercise.starterCode) ||
    hasUnresolvedTaggedValue(exercise.starterFiles) ||
    hasUnresolvedTaggedValue(workspaceSource.starterCode) ||
    hasUnresolvedTaggedValue(workspaceSource.starterFiles)
  ) {
    throw new Error(
      `Could not resolve starter code for "${target.exerciseKey}" in locale "${target.locale}".`,
    );
  }

  const language = languageFor(
    exercise,
    topicBundle as unknown as RecordValue,
  );

  const workspace = resolveExerciseWorkspace({
    language,
    manifest: exercise,
  });

  const wantedId = workspace.entryFileId || workspace.activeFileId;
  const wanted = workspace.nodes.find(
    (node) => node.kind === "file" && node.id === wantedId,
  );
  const entry = wanted?.kind === "file" ? wanted : fallbackTextFile(workspace);

  const entryPath =
    pathForNode(workspace, entry?.id) ||
    String(entry?.name ?? "main");

  const code =
    entry?.kind === "file"
      ? String(entry.content ?? "")
      : String(deriveEntryCode(workspace) ?? "");

  const title =
    String(target.shareTitle ?? "").trim() ||
    String(exercise.title ?? "").trim() ||
    target.exerciseKey;

  const formatted = formatPublicChallengeSocialCardCode(code);

  return {
    title,
    language,
    entryPath,
    code,
    lines: formatted.lines,
    truncated: formatted.truncated,
    imageAlt: `${title} starter code`,
  };
}

function compact(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max
    ? text
    : `${text.slice(0, max - 1).trimEnd()}…`;
}

function languageLabel(language: string) {
  const key = language.trim().toLowerCase();
  const labels: Record<string, string> = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    python: "Python",
    sql: "SQL",
    bash: "Bash",
    java: "Java",
    cpp: "C++",
    c: "C",
    r: "R",
    web: "Web",
  };
  return labels[key] ?? language;
}

export async function renderPublicChallengeSocialCard(target: CardTarget) {
  const model = await resolvePublicChallengeSocialCardModel(target);

  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #07110d 0%, #0b1511 48%, #0a1118 100%)",
          color: "#f8fafc",
          padding: "42px 48px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: "52px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: "28px",
              fontWeight: 800,
            }}
          >
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: "#12b76a",
                color: "#04110a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: "12px",
                fontSize: "24px",
                fontWeight: 900,
              }}
            >
              Z
            </div>
            ZoeSkoul
          </div>

          <div
            style={{
              display: "flex",
              color: "#9fb4a8",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            {languageLabel(model.language)}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "14px",
            marginBottom: "20px",
            maxWidth: "1080px",
            fontSize: "38px",
            lineHeight: 1.12,
            fontWeight: 800,
            letterSpacing: "-1px",
          }}
        >
          {compact(model.title, 72)}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            background: "#0b1210",
            border: "1px solid #26372f",
            borderRadius: "18px",
          }}
        >
          <div
            style={{
              height: "52px",
              minHeight: "52px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 20px",
              background: "#111b17",
              borderBottom: "1px solid #26372f",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
            display: "flex",
                  width: "10px",
                  height: "10px",
                  borderRadius: "999px",
                  background: "#42534b",
                  marginRight: "7px",
                }}
              />
              <div
                style={{
            display: "flex",
                  width: "10px",
                  height: "10px",
                  borderRadius: "999px",
                  background: "#42534b",
                  marginRight: "7px",
                }}
              />
              <div
                style={{
            display: "flex",
                  width: "10px",
                  height: "10px",
                  borderRadius: "999px",
                  background: "#12b76a",
                  marginRight: "15px",
                }}
              />
              <div
                style={{
                  display: "flex",
                  color: "#d8e4dc",
                  fontSize: "19px",
                  fontFamily: "monospace",
                }}
              >
                {compact(model.entryPath, 66)}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                color: "#688078",
                fontSize: "15px",
                fontFamily: "monospace",
              }}
            >
              starter
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "16px 22px 12px 16px",
              fontFamily: "monospace",
            }}
          >
            {model.lines.map((line, index) => (
              <div
                key={`${index}:${line}`}
                style={{
                  display: "flex",
                  minHeight: "29px",
                  lineHeight: "29px",
                  fontSize: "20px",
                }}
              >
                <div
                  style={{
            display: "flex",
                    width: "48px",
                    paddingRight: "14px",
                    textAlign: "right",
                    color: "#52645d",
                    fontFamily: "monospace",
                  }}
                >
                  {index + 1}
                </div>

                <div
                  style={{
                    display: "flex",
                    whiteSpace: "pre",
                    fontFamily: "monospace",
                  }}
                >
                  {highlightCodeLine(line, model.language).map(
                    (token, tokenIndex) => (
                      <span
                        key={`${index}:${tokenIndex}`}
                        style={{
                          color: token.color,
                          fontFamily: "monospace",
                        }}
                      >
                        {token.text}
                      </span>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "14px",
            color: "#789086",
            fontSize: "16px",
            fontWeight: 600,
          }}
        >
          zoeskoul.com
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );

  const blob = await response.blob();

  const file = new File(
    [blob],
    `zoeskoul-${target.exerciseKey.replace(/[^a-zA-Z0-9_-]+/g, "-") || "challenge"}.png`,
    { type: "image/png" },
  );

  return { file, model };
}

export async function uploadGeneratedPublicChallengeSocialCard(
  target: CardTarget,
) {
  const rendered = await renderPublicChallengeSocialCard(target);
  const uploaded = await uploadChallengeOgImage(rendered.file);

  return {
    publicId: uploaded.publicId,
    imageAlt: rendered.model.imageAlt,
  };
}

async function cleanupGeneratedImage(publicId: string) {
  try {
    await destroyCloudinaryImage(publicId);
  } catch (error) {
    console.error(
      "[public-challenge-social-card] generated image cleanup failed",
      error,
    );
  }
}

export async function ensurePublicChallengeSocialImage<
  T extends PublicChallengeSocialImageSource,
>(challenge: T) {
  if (challenge.ogImagePublicId) return challenge;

  const generated = await uploadGeneratedPublicChallengeSocialCard({
    locale: challenge.locale,
    subjectSlug: challenge.subjectSlug,
    topicSlug: challenge.topicSlug,
    exerciseKey: challenge.exerciseKey,
    shareTitle: challenge.shareTitle,
  });

  let cleaned = false;

  try {
    const claimed = await prisma.practiceChallengeLink.updateMany({
      where: {
        id: challenge.id,
        ogImagePublicId: null,
      },
      data: {
        ogImagePublicId: generated.publicId,
        ogImageAlt: challenge.ogImageAlt || generated.imageAlt,
      },
    });

    if (claimed.count === 1) {
      return {
        ...challenge,
        ogImagePublicId: generated.publicId,
        ogImageAlt: challenge.ogImageAlt || generated.imageAlt,
      };
    }

    const current = await prisma.practiceChallengeLink.findUnique({
      where: { id: challenge.id },
      select: {
        ogImagePublicId: true,
        ogImageAlt: true,
      },
    });

    await cleanupGeneratedImage(generated.publicId);
    cleaned = true;

    if (!current?.ogImagePublicId) {
      throw new Error(
        "Public challenge disappeared while preparing its social image.",
      );
    }

    return {
      ...challenge,
      ogImagePublicId: current.ogImagePublicId,
      ogImageAlt: current.ogImageAlt,
    };
  } catch (error) {
    if (!cleaned) {
      await cleanupGeneratedImage(generated.publicId);
    }
    throw error;
  }
}
