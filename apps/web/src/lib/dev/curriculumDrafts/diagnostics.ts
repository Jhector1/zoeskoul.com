import { spawnSync } from "node:child_process";

export type DraftDiagnostic = {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  path?: string;
  exerciseId?: string;
};

export type ExerciseSummary = {
  id: string;
  kind: string;
  purpose?: string | null;
  referencedBy: string[];
  starterFileCount: number;
  solutionFileCount: number;
  checkCount: number;
  diagnostics: DraftDiagnostic[];
};

export type FilePairSummary = {
  exerciseId: string;
  path: string;
  language?: string | null;
  starterContent?: string | null;
  solutionContent?: string | null;
  starterMessageKey?: string | null;
  solutionMessageKey?: string | null;
};

export type ProjectFlowStep = {
  cardId: string;
  index: number;
  stepId: string;
  exerciseKey?: string | null;
  carryFromPrev: boolean;
  matchesPreviousSolution: boolean | null;
  addedFiles: string[];
  removedFiles: string[];
  changedFiles: string[];
};

export type TopicDiagnosticsResult = {
  diagnostics: DraftDiagnostic[];
  exercises: ExerciseSummary[];
  filePairs: FilePairSummary[];
  projectFlow: ProjectFlowStep[];
  resolvedReferences: Record<string, string>;
};

type JsonObject = Record<string, unknown>;

type FileLike = {
  path: string;
  content?: unknown;
  language?: string | null;
};

function asObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getByPath(root: unknown, keyPath: string) {
  const parts = keyPath.split(".").filter(Boolean);
  let current: unknown = root;

  for (const part of parts) {
    const object = asObject(current);
    if (!object) return undefined;
    current = object[part];
  }

  return current;
}

function walkStrings(value: unknown, visit: (text: string, jsonPath: string) => void, jsonPath = "$") {
  if (typeof value === "string") {
    visit(value, jsonPath);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, visit, `${jsonPath}[${index}]`));
    return;
  }

  const object = asObject(value);
  if (!object) return;

  for (const [key, child] of Object.entries(object)) {
    walkStrings(child, visit, `${jsonPath}.${key}`);
  }
}

function normalizeMessageRef(value: string) {
  if (value.startsWith("@:")) return value.slice(2);
  return value;
}

function resolveMessageContent(value: unknown, messagesJson: unknown | null) {
  if (typeof value !== "string") return null;
  const key = normalizeMessageRef(value);
  if (!messagesJson) return value;
  const resolved = getByPath(messagesJson, key);
  return typeof resolved === "string" ? resolved : value;
}

function messageKeyForContent(value: unknown, messagesJson: unknown | null) {
  if (typeof value !== "string" || !messagesJson) return null;
  if (value.startsWith("@:")) return value.slice(2);
  if (getByPath(messagesJson, value) !== undefined) return value;
  return null;
}

function filesFromExercise(exercise: JsonObject, field: "starterFiles" | "solutionFiles") {
  const direct = asArray(exercise[field]) as JsonObject[];
  const recipe = asObject(exercise.recipe);
  const recipeFiles = asArray(recipe?.[field]) as JsonObject[];
  const files = direct.length ? direct : recipeFiles;

  return files
    .map((file) => ({
      path: asString(file.path) ?? "",
      content: file.content,
      language: asString(file.language),
    }))
    .filter((file): file is FileLike => Boolean(file.path));
}

function semanticChecksFromExercise(exercise: JsonObject) {
  const direct = asArray(exercise.semanticChecks);
  const checks = asArray(exercise.checks);
  const recipe = asObject(exercise.recipe);
  const recipeChecks = asArray(recipe?.semanticChecks);
  return direct.length ? direct : recipeChecks.length ? recipeChecks : checks;
}

function pythonSyntaxError(code: string) {
  if (!code.trim()) return null;
  const result = spawnSync("python3", ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], {
    input: code,
    encoding: "utf8",
    timeout: 3000,
  });

  if (result.status === 0) return null;
  return (result.stderr || result.stdout || "Python syntax error").trim();
}

function shouldSyntaxCheck(file: FileLike, exercise: JsonObject) {
  const language = asString(file.language) ?? asString(exercise.language);
  return language === "python" || file.path.endsWith(".py");
}

function fileMap(files: FileLike[], messagesJson: unknown | null) {
  const map = new Map<string, string>();
  for (const file of files) {
    const content = resolveMessageContent(file.content, messagesJson) ?? "";
    map.set(file.path, content);
  }
  return map;
}

function diffFileMaps(prev: Map<string, string>, next: Map<string, string>) {
  const prevPaths = new Set(prev.keys());
  const nextPaths = new Set(next.keys());
  const addedFiles = [...nextPaths].filter((file) => !prevPaths.has(file)).sort();
  const removedFiles = [...prevPaths].filter((file) => !nextPaths.has(file)).sort();
  const changedFiles = [...nextPaths]
    .filter((file) => prevPaths.has(file) && prev.get(file) !== next.get(file))
    .sort();

  return { addedFiles, removedFiles, changedFiles };
}

function findReferencedExerciseIds(bundleJson: unknown) {
  const refs = new Map<string, string[]>();
  const cards = asArray(asObject(bundleJson)?.cards) as JsonObject[];

  const add = (id: string | null, location: string) => {
    if (!id) return;
    const existing = refs.get(id) ?? [];
    existing.push(location);
    refs.set(id, existing);
  };

  for (const card of cards) {
    const cardId = asString(card.id) ?? "card";
    const tryIt = asObject(card.tryIt);
    add(asString(tryIt?.exerciseKey) ?? asString(tryIt?.id), `${cardId}.tryIt`);

    const project = asObject(card.project);
    for (const [index, step] of (asArray(project?.steps) as JsonObject[]).entries()) {
      add(asString(step.exerciseKey), `${cardId}.project.steps[${index}]`);
    }

    const quiz = asObject(card.quiz);
    for (const [index, key] of (asArray(quiz?.exerciseKeys) as unknown[]).entries()) {
      add(asString(key), `${cardId}.quiz.exerciseKeys[${index}]`);
    }
  }

  return refs;
}

function solutionQualityDiagnostics(args: {
  exercise: JsonObject;
  file: FileLike;
  content: string;
}) {
  const diagnostics: DraftDiagnostic[] = [];
  const id = asString(args.exercise.id) ?? "unknown";
  const path = args.file.path;
  const add = (code: string, message: string) =>
    diagnostics.push({ severity: "error", code, message, path, exerciseId: id });

  if (/\bTODO\b/i.test(args.content)) add("solution.todo", "Official solution still contains TODO.");
  if (/^\s*pass\s*(#.*)?$/m.test(args.content)) add("solution.pass", "Official solution contains pass in executable code.");
  if (/\bvalue_(?:\d+|n)\b/.test(args.content)) add("solution.placeholder", "Official solution contains generated placeholder names like value_1/value_n.");
  if (/install_semantic_stdout|_user_stdout_buffer/.test(args.content)) add("solution.stdout_spoof", "Official solution contains semantic stdout spoofing helpers.");
  if (/def\s+\w+\s*\([^)]*\)\s*:\s*(?:\n\s+[^\n]*){0,3}\n\s+return\s+(?:2|3|\"2\"|\"3\")\s*(?:#.*)?$/m.test(args.content)) {
    diagnostics.push({
      severity: "warning",
      code: "solution.suspicious_constant",
      message: "Solution has a suspicious constant-only return; verify it computes from real objects/data.",
      path,
      exerciseId: id,
    });
  }

  return diagnostics;
}

function checkDiagnostics(exercise: JsonObject) {
  const checks = semanticChecksFromExercise(exercise);
  const id = asString(exercise.id) ?? "unknown";
  if (asString(exercise.kind) !== "code_input") return [];
  if (!checks.length) {
    return [{ severity: "warning", code: "checks.missing", message: "Code-input exercise has no checks.", exerciseId: id } satisfies DraftDiagnostic];
  }

  const checkTypes = checks
    .map((check) => asString(asObject(check)?.type) ?? asString(asObject(check)?.kind))
    .filter(Boolean);

  const weakOnly = checkTypes.length > 0 && checkTypes.every((type) => type === "printed_line_count" || type === "expected_output");
  return weakOnly
    ? [{ severity: "warning", code: "checks.weak", message: "Checks are only printed-line/output based.", exerciseId: id } satisfies DraftDiagnostic]
    : [];
}

export function analyzeDraftTopic(args: {
  bundleJson: unknown;
  messagesJson: unknown | null;
}): TopicDiagnosticsResult {
  const diagnostics: DraftDiagnostic[] = [];
  const resolvedReferences: Record<string, string> = {};
  const refs = new Set<string>();

  const scanRefs = (source: unknown, label: string) => {
    walkStrings(source, (text, jsonPath) => {
      for (const match of text.matchAll(/@:([A-Za-z0-9_.-]+)/g)) {
        const ref = match[1] as string;
        refs.add(ref);
        const resolved = getByPath(args.messagesJson, ref);
        if (typeof resolved === "string") {
          resolvedReferences[ref] = resolved;
        } else {
          diagnostics.push({
            severity: "error",
            code: "i18n.unresolved_ref",
            message: `Unresolved @: reference: ${ref}`,
            path: `${label}${jsonPath}`,
          });
        }
      }
    });
  };

  scanRefs(args.bundleJson, "bundle");
  scanRefs(args.messagesJson, "messages");

  const referenced = findReferencedExerciseIds(args.bundleJson);
  const bundle = asObject(args.bundleJson);
  const exercises = (asArray(bundle?.exercises) as JsonObject[]).filter((exercise) => asString(exercise.id));
  const exerciseById = new Map(exercises.map((exercise) => [asString(exercise.id) as string, exercise]));
  const summaries: ExerciseSummary[] = [];
  const filePairs: FilePairSummary[] = [];

  for (const [exerciseId, locations] of referenced.entries()) {
    const exercise = exerciseById.get(exerciseId);
    if (!exercise) {
      diagnostics.push({
        severity: "error",
        code: "exercise.missing_reference",
        message: `Card references missing exercise: ${exerciseId}`,
        exerciseId,
      });
      continue;
    }

    if (locations.some((location) => location.includes(".quiz.")) && asString(exercise.kind) === "code_input") {
      diagnostics.push({
        severity: "error",
        code: "quiz.code_input",
        message: "Quiz card references a code_input exercise.",
        exerciseId,
      });
    }
  }

  for (const exercise of exercises) {
    const id = asString(exercise.id) as string;
    const kind = asString(exercise.kind) ?? "unknown";
    const purpose = asString(exercise.purpose);
    const starterFiles = filesFromExercise(exercise, "starterFiles");
    const solutionFiles = filesFromExercise(exercise, "solutionFiles");
    const exerciseDiagnostics: DraftDiagnostic[] = [];
    const locations = referenced.get(id) ?? [];

    if (kind === "code_input" && !locations.length) {
      exerciseDiagnostics.push({ severity: "error", code: "exercise.unreachable", message: "Code-input exercise is not referenced by a visible card.", exerciseId: id });
    }

    if (kind === "code_input" && locations.length > 1) {
      exerciseDiagnostics.push({ severity: "warning", code: "exercise.multiple_refs", message: "Code-input exercise is referenced more than once.", exerciseId: id });
    }

    for (const file of starterFiles) {
      const key = messageKeyForContent(file.content, args.messagesJson);
      const content = resolveMessageContent(file.content, args.messagesJson) ?? "";
      if (typeof file.content === "string" && file.content.startsWith("@:") && content === file.content) {
        exerciseDiagnostics.push({ severity: "error", code: "starter.missing_key", message: `Missing starter content key: ${file.content}`, path: file.path, exerciseId: id });
      }
      if (shouldSyntaxCheck(file, exercise)) {
        const error = pythonSyntaxError(content);
        if (error) exerciseDiagnostics.push({ severity: "error", code: "starter.python_syntax", message: error, path: file.path, exerciseId: id });
      }
      filePairs.push({
        exerciseId: id,
        path: file.path,
        language: file.language ?? asString(exercise.language),
        starterContent: content,
        solutionContent: null,
        starterMessageKey: key,
        solutionMessageKey: null,
      });
    }

    const solutionByPath = new Map(solutionFiles.map((file) => [file.path, file]));
    for (const file of solutionFiles) {
      const key = messageKeyForContent(file.content, args.messagesJson);
      const content = resolveMessageContent(file.content, args.messagesJson) ?? "";
      if (shouldSyntaxCheck(file, exercise)) {
        const error = pythonSyntaxError(content);
        if (error) exerciseDiagnostics.push({ severity: "error", code: "solution.python_syntax", message: error, path: file.path, exerciseId: id });
      }
      exerciseDiagnostics.push(...solutionQualityDiagnostics({ exercise, file, content }));

      const existingPair = filePairs.find((pair) => pair.exerciseId === id && pair.path === file.path);
      if (existingPair) {
        existingPair.solutionContent = content;
        existingPair.solutionMessageKey = key;
      } else {
        filePairs.push({
          exerciseId: id,
          path: file.path,
          language: file.language ?? asString(exercise.language),
          starterContent: null,
          solutionContent: content,
          starterMessageKey: null,
          solutionMessageKey: key,
        });
      }
    }

    for (const file of starterFiles) {
      if (!solutionByPath.has(file.path)) {
        exerciseDiagnostics.push({ severity: "warning", code: "solution.missing_path", message: "Starter file has no matching solution file path.", path: file.path, exerciseId: id });
      }
    }

    exerciseDiagnostics.push(...checkDiagnostics(exercise));
    diagnostics.push(...exerciseDiagnostics);

    summaries.push({
      id,
      kind,
      purpose,
      referencedBy: locations,
      starterFileCount: starterFiles.length,
      solutionFileCount: solutionFiles.length,
      checkCount: semanticChecksFromExercise(exercise).length,
      diagnostics: exerciseDiagnostics,
    });
  }

  const cards = (asArray(bundle?.cards) as JsonObject[]);
  const projectFlow: ProjectFlowStep[] = [];

  for (const card of cards) {
    const cardId = asString(card.id) ?? "project";
    const project = asObject(card.project);
    const steps = asArray(project?.steps) as JsonObject[];
    if (!steps.length) continue;

    let prevSolution: Map<string, string> | null = null;
    for (const [index, step] of steps.entries()) {
      const exerciseKey = asString(step.exerciseKey);
      const exercise = exerciseKey ? exerciseById.get(exerciseKey) : undefined;
      const starter = exercise ? fileMap(filesFromExercise(exercise, "starterFiles"), args.messagesJson) : new Map<string, string>();
      const solution = exercise ? fileMap(filesFromExercise(exercise, "solutionFiles"), args.messagesJson) : new Map<string, string>();
      const diff = prevSolution ? diffFileMaps(prevSolution, starter) : { addedFiles: [], removedFiles: [], changedFiles: [] };
      const matchesPreviousSolution = prevSolution ? diff.addedFiles.length === 0 && diff.removedFiles.length === 0 && diff.changedFiles.length === 0 : null;
      const carryFromPrev = step.carryFromPrev === true;

      if (index > 0 && !carryFromPrev) {
        diagnostics.push({ severity: "warning", code: "project.carry_missing", message: "Project step after step 1 is missing carryFromPrev: true.", exerciseId: exerciseKey ?? undefined });
      }
      if (index > 0 && !matchesPreviousSolution) {
        diagnostics.push({ severity: "warning", code: "project.carry_mismatch", message: "Project step starter does not exactly match previous step solution.", exerciseId: exerciseKey ?? undefined });
      }

      projectFlow.push({
        cardId,
        index,
        stepId: asString(step.id) ?? `step-${index + 1}`,
        exerciseKey,
        carryFromPrev,
        matchesPreviousSolution,
        ...diff,
      });

      prevSolution = solution;
    }
  }

  return {
    diagnostics,
    exercises: summaries.sort((a, b) => a.id.localeCompare(b.id)),
    filePairs: filePairs.sort((a, b) => `${a.exerciseId}/${a.path}`.localeCompare(`${b.exerciseId}/${b.path}`)),
    projectFlow,
    resolvedReferences,
  };
}
