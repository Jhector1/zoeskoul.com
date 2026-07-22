export type PracticeTutorDomain =
  | "sql"
  | "terminal"
  | "programming"
  | "general";

export type PracticeTutorConversationSnapshot = {
  ok: boolean;
  answer: unknown;
  createdAt: string;
};

export type PracticeTutorDiagnosticContext = {
  version: 1;
  domain: PracticeTutorDomain;
  task: {
    title: string;
    prompt: string;
    kind: string;
    topicSlug: string;
  };
  learnerVisibleContext: unknown;
  environment: Record<string, unknown>;
  starterState: Record<string, unknown>;
  learnerState: {
    currentAttempt: unknown;
    recentSubmittedAttempts: PracticeTutorConversationSnapshot[];
  };
  failedChecks: unknown;
  privateReference: {
    expected: unknown;
    expectedAnswer: unknown;
    authoredExplanation: string | null;
  };
};

type UnknownRecord = Record<string, unknown>;

const SENSITIVE_KEY_FRAGMENTS = [
  "apikey",
  "authorization",
  "bearer",
  "cookie",
  "credential",
  "password",
  "privatekey",
  "refreshtoken",
  "secretkey",
  "sessioncookie",
];

const IMPLEMENTATION_ONLY_KEYS = new Set([
  "guestid",
  "hiddenShellCheck".toLowerCase(),
  "instanceid",
  "requestid",
  "sessionid",
  "userid",
]);


const PRIVATE_EXERCISE_KEYS = new Set([
  "answer",
  "answerkey",
  "correct",
  "correctanswer",
  "correctoption",
  "expected",
  "expectedanswer",
  "expectedcanon",
  "grader",
  "grading",
  "secretpayload",
  "solution",
  "solutioncode",
  "solutionfiles",
  "tests",
  "validation",
]);

const ENVIRONMENT_KEYS = new Set([
  "allowlanguageswitch",
  "codesurface",
  "editorheight",
  "entry",
  "fixedsqldialect",
  "ideconfig",
  "language",
  "mode",
  "recipetype",
  "runtime",
  "shelltaskmode",
  "sqlfileorder",
  "terminalcwd",
  "tools",
  "workspace",
]);

const STARTER_KEYS = new Set([
  "examples",
  "expectedexample",
  "startercode",
  "starterfiles",
  "starterstdin",
  "stdinhint",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string) {
  const normalized = normalizedKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function clipString(value: string, max = 7000) {
  return value.length <= max ? value : `${value.slice(0, max)}\n[trimmed]`;
}

function sanitizeStructured(
  value: unknown,
  options: {
    depth?: number;
    maxDepth?: number;
    maxArray?: number;
    maxKeys?: number;
    maxString?: number;
  } = {},
): unknown {
  const depth = options.depth ?? 0;
  const maxDepth = options.maxDepth ?? 7;
  const maxArray = options.maxArray ?? 40;
  const maxKeys = options.maxKeys ?? 80;
  const maxString = options.maxString ?? 7000;

  if (depth > maxDepth) return "[trimmed]";
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") return clipString(value, maxString);
  if (Array.isArray(value)) {
    return value.slice(0, maxArray).map((entry) =>
      sanitizeStructured(entry, {
        ...options,
        depth: depth + 1,
      }),
    );
  }
  if (!isRecord(value)) return clipString(String(value), 1200);

  const out: UnknownRecord = {};
  for (const [key, entry] of Object.entries(value).slice(0, maxKeys)) {
    const normalized = normalizedKey(key);
    if (isSensitiveKey(key) || IMPLEMENTATION_ONLY_KEYS.has(normalized)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = sanitizeStructured(entry, {
      ...options,
      depth: depth + 1,
    });
  }
  return out;
}

function sanitizeLearnerVisibleContext(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 7) return "[trimmed]";
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") return clipString(value, 7000);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) =>
      sanitizeLearnerVisibleContext(entry, depth + 1),
    );
  }
  if (!isRecord(value)) return clipString(String(value), 1200);

  const out: UnknownRecord = {};
  for (const [key, entry] of Object.entries(value).slice(0, 100)) {
    const normalized = normalizedKey(key);
    if (PRIVATE_EXERCISE_KEYS.has(normalized)) continue;
    if (isSensitiveKey(key) || IMPLEMENTATION_ONLY_KEYS.has(normalized)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = sanitizeLearnerVisibleContext(entry, depth + 1);
  }
  return out;
}

function pickFields(value: unknown, keys: Set<string>) {
  if (!isRecord(value)) return {};
  const out: UnknownRecord = {};

  for (const [key, entry] of Object.entries(value)) {
    if (!keys.has(normalizedKey(key))) continue;
    out[key] = sanitizeStructured(entry);
  }

  return out;
}

function firstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function hasKey(value: unknown, names: string[]) {
  if (!isRecord(value)) return false;
  const wanted = new Set(names.map(normalizedKey));
  return Object.keys(value).some((key) => wanted.has(normalizedKey(key)));
}

export function resolvePracticeTutorDomain(args: {
  kind: string;
  publicPayload: unknown;
  expected: unknown;
  userAnswer?: unknown;
}): PracticeTutorDomain {
  const publicRecord = isRecord(args.publicPayload) ? args.publicPayload : {};
  const expectedRecord = isRecord(args.expected) ? args.expected : {};
  const answerRecord = isRecord(args.userAnswer) ? args.userAnswer : {};

  const language = firstString([
    publicRecord.language,
    expectedRecord.language,
    answerRecord.language,
  ])?.toLowerCase();

  if (
    language === "sql" ||
    hasKey(publicRecord, ["fixedSqlDialect", "sqlFileOrder"]) ||
    hasKey(expectedRecord, ["sqlFileOrder"])
  ) {
    return "sql";
  }

  const recipeType = firstString([
    publicRecord.recipeType,
    expectedRecord.recipeType,
  ])?.toLowerCase();
  const shellLanguage = ["bash", "sh", "shell", "zsh"].includes(language ?? "");

  if (
    recipeType === "shell_task" ||
    hasKey(expectedRecord, ["terminalExpectations", "shellTaskMode"]) ||
    hasKey(answerRecord, ["terminalEvidence"]) ||
    (shellLanguage && hasKey(expectedRecord, ["workspaceExpectations"]))
  ) {
    return "terminal";
  }

  if (args.kind === "code_input") return "programming";
  return "general";
}

function buildEnvironment(publicPayload: unknown, expected: unknown) {
  return {
    ...pickFields(publicPayload, ENVIRONMENT_KEYS),
    expectedRuntime: pickFields(expected, ENVIRONMENT_KEYS),
  };
}

function buildStarterState(publicPayload: unknown) {
  const starter = pickFields(publicPayload, STARTER_KEYS);
  const publicRecord = isRecord(publicPayload) ? publicPayload : {};
  const workspace = isRecord(publicRecord.workspace) ? publicRecord.workspace : null;

  if (workspace) {
    const workspaceStarter = pickFields(workspace, STARTER_KEYS);
    if (Object.keys(workspaceStarter).length) {
      starter.workspace = workspaceStarter;
    }
  }

  return starter;
}

function buildPrivateReference(secretPayload: unknown) {
  const secret = isRecord(secretPayload) ? secretPayload : {};
  const expected = sanitizeStructured(secret.expected, {
    maxArray: 60,
    maxKeys: 100,
    maxString: 9000,
  });
  const expectedAnswer = sanitizeStructured(secret.expectedAnswerPayload, {
    maxArray: 40,
    maxKeys: 60,
    maxString: 5000,
  });
  const authoredExplanation = firstString([
    secret.explanation,
    isRecord(secret.expected) ? secret.expected.explanation : null,
    isRecord(secret.expected) ? secret.expected.rationale : null,
  ]);

  return {
    expected,
    expectedAnswer,
    authoredExplanation: authoredExplanation ? clipString(authoredExplanation, 5000) : null,
  };
}

export function buildPracticeTutorDiagnosticContext(args: {
  title: string;
  prompt: string;
  kind: string;
  topicSlug: string;
  publicPayload: unknown;
  secretPayload: unknown;
  userAnswer: unknown;
  failureContext: unknown;
  recentAttempts: PracticeTutorConversationSnapshot[];
}): PracticeTutorDiagnosticContext {
  const secret = isRecord(args.secretPayload) ? args.secretPayload : {};
  const expected = secret.expected;
  const domain = resolvePracticeTutorDomain({
    kind: args.kind,
    publicPayload: args.publicPayload,
    expected,
    userAnswer: args.userAnswer,
  });

  return {
    version: 1,
    domain,
    task: {
      title: clipString(args.title, 500),
      prompt: clipString(args.prompt, 7000),
      kind: args.kind,
      topicSlug: args.topicSlug,
    },
    learnerVisibleContext: sanitizeLearnerVisibleContext(args.publicPayload),
    environment: buildEnvironment(args.publicPayload, expected),
    starterState: buildStarterState(args.publicPayload),
    learnerState: {
      currentAttempt: sanitizeStructured(args.userAnswer, {
        maxArray: 60,
        maxKeys: 100,
        maxString: 9000,
      }),
      recentSubmittedAttempts: args.recentAttempts.slice(0, 4).map((attempt) => ({
        ok: Boolean(attempt.ok),
        answer: sanitizeStructured(attempt.answer, {
          maxArray: 60,
          maxKeys: 100,
          maxString: 9000,
        }),
        createdAt: attempt.createdAt,
      })),
    },
    failedChecks: sanitizeStructured(args.failureContext, {
      maxArray: 40,
      maxKeys: 80,
      maxString: 6000,
    }),
    privateReference: buildPrivateReference(args.secretPayload),
  };
}
