import fs from "node:fs/promises";
import {
    deriveManifestTerminalBootstrap,
    mergeManifestTerminalBootstraps,
    type CourseBlueprint,
    type CoursePlan,
    type CourseSpec,
    type TopicBundleManifest,
} from "@zoeskoul/curriculum-contracts";
import { getDraftTopicMessagesPath } from "@zoeskoul/curriculum-core";
import {
    getProfileServices,
    getSubjectShape,
} from "@zoeskoul/curriculum-profiles";
import { buildSubjectManifestFromPlan } from "../emit/buildSubjectManifestFromPlan.js";
import { buildSubjectMessagesFromPlan } from "../emit/buildSubjectMessagesFromPlan.js";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { buildMessagesFromDraft } from "../emit/buildMessagesFromDraft.js";
import { resolveLogicalSectionSlug } from "../emit/resolveLogicalSectionSlug.js";
import { assertNonEmptyMessages } from "../emit/translateNonEmptyMessages.js";
import { writeSubjectArtifacts } from "../write/writeSubjectArtifacts.js";
import { writeTopicArtifacts } from "../write/writeTopicArtifacts.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { writeTopicCompileStatus } from "../reports/writeTopicCompileStatus.js";
import { writeCourseQualityReport } from "../reports/writeCourseQualityReport.js";
import { buildCourseQualityReportFromArtifacts } from "../reports/buildCourseQualityReportFromArtifacts.js";
import { buildCurriculumQualityReport } from "../quality/buildCurriculumQualityReport.js";
import { buildTopicAttemptHashes } from "../reports/topicGenerationAudit.js";
import { listTopicPlanNodes } from "../plan/listTopicPlanNodes.js";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";
import { resolveWorkspacePolicy } from "../policy/resolveWorkspacePolicy.js";
import { validateWorkspacePolicy } from "../validate/validateWorkspacePolicy.js";
import { assertTopicAuthoringDraft } from "../validate/assertTopicAuthoringDraft.js";
import { validateTopicBundleIdentity } from "../validate/validateTopicBundleIdentity.js";
import { validateTopicMessagesIdentity } from "../validate/validateTopicMessagesIdentity.js";
import { validateGenericExerciseHelp } from "../validate/validateGenericExerciseHelp.js";
import { validateStarterCodeDoesNotRevealSolution } from "../validate/validateStarterCodeDoesNotRevealSolution.js";
import { validateNoDummyFillBlankQuestions } from "../validate/validateNoDummyFillBlankQuestions.js";
import type { CompileProgressCallback } from "./compileProgress.js";
import type { CompileValidationSkipOptions } from "./validationState.js";
import { resolveCompileValidationState } from "./validationState.js";

import {
    getTopicReportDir,
    readCurrentDraftOutputForRebuild,
    readSavedDraftForRebuild,
    type RebuildDraftSourcePreference,
} from "./savedDraftForRebuild.js";

async function readJsonIfExists(filePath: string): Promise<unknown | undefined> {
    try {
        return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code?: unknown }).code === "ENOENT"
        ) {
            return undefined;
        }

        throw error;
    }
}

async function readExistingLocaleMessages(args: {
    locale: string;
    subjectSlug: string;
    moduleOrder: number;
    topicId: string;
}) {
    const moduleDir = `module${args.moduleOrder}`;
    return readJsonIfExists(
        getDraftTopicMessagesPath(
            args.locale,
            args.subjectSlug,
            moduleDir,
            args.topicId,
        ),
    ) as Promise<Record<string, unknown> | undefined>;
}

function qualityFailures(report: {
    issues: Array<{ severity: string; message: string }>;
}) {
    return report.issues.filter(
        (issue) => issue.severity === "blocker" || issue.severity === "error",
    );
}

function goldenFailures(report: {
    issues: Array<{ severity: string; message: string }>;
}) {
    return report.issues.filter((issue) => issue.severity === "error");
}

function replaceKnownIdentityStrings(
    value: unknown,
    replacements: Array<[string, string]>,
): unknown {
    if (typeof value === "string") {
        return replacements.reduce((out, [from, to]) => out.split(from).join(to), value);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => replaceKnownIdentityStrings(entry, replacements));
    }

    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
                const normalizedKey = replacements.reduce(
                    (out, [from, to]) => out.split(from).join(to),
                    key,
                );

                return [normalizedKey, replaceKnownIdentityStrings(entry, replacements)];
            }),
        );
    }

    return value;
}

function uniqueIdentityReplacements(
    entries: Array<[unknown, unknown]>,
): Array<[string, string]> {
    const seen = new Set<string>();

    return entries
        .flatMap(([from, to]) => {
            if (typeof from !== "string" || typeof to !== "string") return [];
            if (!from || from === to || seen.has(from)) return [];
            seen.add(from);
            return [[from, to] as [string, string]];
        })
        .sort(([a], [b]) => b.length - a.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRecordPath(
    root: Record<string, unknown>,
    path: string[],
): Record<string, unknown> | undefined {
    let cursor: unknown = root;

    for (const part of path) {
        if (!isRecord(cursor)) return undefined;
        cursor = cursor[part];
    }

    return isRecord(cursor) ? cursor : undefined;
}

function ensureRecordPath(
    root: Record<string, unknown>,
    path: string[],
): Record<string, unknown> {
    let cursor = root;

    for (const part of path) {
        if (!isRecord(cursor[part])) {
            cursor[part] = {};
        }

        cursor = cursor[part] as Record<string, unknown>;
    }

    return cursor;
}

function findRecordAtKey(
    root: Record<string, unknown>,
    key: string,
    seen = new Set<Record<string, unknown>>(),
): Record<string, unknown> | undefined {
    if (seen.has(root)) return undefined;
    seen.add(root);

    const direct = root[key];
    if (isRecord(direct)) return direct;

    for (const value of Object.values(root)) {
        if (!isRecord(value)) continue;
        const found = findRecordAtKey(value, key, seen);
        if (found) return found;
    }

    return undefined;
}

function normalizeCurrentDraftMessagePathsForSeed(args: {
    seed: ReturnType<typeof buildTopicSeedFromPlanNode>;
    messagesByLocale: Record<string, Record<string, unknown>>;
}): Record<string, Record<string, unknown>> {
    for (const messages of Object.values(args.messagesByLocale)) {
        for (const rootKey of ["topics", "sketches"] as const) {
            const root = messages[rootKey];
            if (!isRecord(root)) continue;

            const targetPath = [
                args.seed.subjectSlug,
                args.seed.moduleSlug,
                args.seed.topicId,
            ];
            const existingTarget = getRecordPath(root, targetPath);
            if (existingTarget) continue;

            const candidate = findRecordAtKey(root, args.seed.topicId);
            if (!candidate) continue;

            const targetParent = ensureRecordPath(root, [
                args.seed.subjectSlug,
                args.seed.moduleSlug,
            ]);
            targetParent[args.seed.topicId] = candidate;
        }
    }

    return args.messagesByLocale;
}

function isCurrentOutputRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


function normalizeCurrentOutputMessageKeySegment(value: string): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function currentOutputFileContentMessageField(args: {
    group: "starterFiles" | "solutionFiles" | "files" | "fixtureFiles";
    filePath: string | undefined;
    index: number;
}): string {
    const normalizedPath = normalizeCurrentOutputMessageKeySegment(args.filePath ?? "");
    const fileKey = normalizedPath || `file_${args.index + 1}`;
    return `${args.group}.${fileKey}.content`;
}

function currentOutputStarterFileContentMessageField(
    filePath: string | undefined,
    index: number,
): string {
    return currentOutputFileContentMessageField({
        group: "starterFiles",
        filePath,
        index,
    });
}

function currentOutputSolutionFileContentMessageField(
    filePath: string | undefined,
    index: number,
): string {
    return currentOutputFileContentMessageField({
        group: "solutionFiles",
        filePath,
        index,
    });
}

function isCurrentOutputEntryStarterFile(file: Record<string, unknown>): boolean {
    const path = typeof file.path === "string" ? file.path : "";
    return file.isEntry === true || file.entry === true || path === "main.sh";
}

function setCurrentOutputMessageForAllLocales(args: {
    messagesByLocale: Record<string, Record<string, unknown>>;
    messagePath: string;
    value: string;
}) {
    for (const localeMessages of Object.values(args.messagesByLocale)) {
        setCurrentOutputDottedMessageValue(
            localeMessages,
            args.messagePath,
            args.value,
        );
    }
}

function normalizeCurrentOutputVisibleStarterFileContentRefs(args: {
    value: unknown;
    messageBase: string;
    messagesByLocale: Record<string, Record<string, unknown>>;
}) {
    if (!Array.isArray(args.value)) return;

    args.value.forEach((entry, index) => {
        if (!isCurrentOutputRecord(entry)) return;
        if (isCurrentOutputEntryStarterFile(entry)) return;

        const content = entry.content;
        if (typeof content !== "string" || content.startsWith("@:")) return;

        const filePath = typeof entry.path === "string" ? entry.path : undefined;
        const field = currentOutputStarterFileContentMessageField(filePath, index);
        const messagePath = `${args.messageBase}.${field}`;

        setCurrentOutputMessageForAllLocales({
            messagesByLocale: args.messagesByLocale,
            messagePath,
            value: content,
        });

        entry.content = `@:${messagePath}`;
    });
}

function normalizeCurrentOutputSolutionFileContentRefs(args: {
    value: unknown;
    messageBase: string;
    messagesByLocale: Record<string, Record<string, unknown>>;
    fallbackEntrySolutionRef?: string;
}) {
    const solutionFiles = args.value;
    if (!Array.isArray(solutionFiles)) return;

    solutionFiles.forEach((entry, index) => {
        if (!isCurrentOutputRecord(entry)) return;

        const content = entry.content;
        if (typeof content !== "string" || content.trim().length === 0 || content.startsWith("@:")) {
            return;
        }

        const filePath = typeof entry.path === "string"
            ? entry.path
            : typeof entry.name === "string"
              ? entry.name
              : undefined;
        const isEntry = entry.isEntry === true || entry.entry === true || filePath === "main.py" || filePath === "main.sh";
        const messagePath = isEntry && solutionFiles.length === 1 && args.fallbackEntrySolutionRef
            ? args.fallbackEntrySolutionRef.replace(/^@:/, "")
            : `${args.messageBase}.${currentOutputSolutionFileContentMessageField(filePath, index)}`;

        setCurrentOutputMessageForAllLocales({
            messagesByLocale: args.messagesByLocale,
            messagePath,
            value: content,
        });

        entry.content = `@:${messagePath}`;
    });
}

function normalizeCurrentOutputSemanticCheckMessageRefs(args: {
    semanticChecks: unknown;
    messageBase: string;
    messagesByLocale: Record<string, Record<string, unknown>>;
}) {
    if (!Array.isArray(args.semanticChecks)) return;

    args.semanticChecks.forEach((entry, index) => {
        if (!isCurrentOutputRecord(entry)) return;
        const message = entry.message;
        if (typeof message !== "string" || message.trim().length === 0 || message.startsWith("@:")) {
            return;
        }

        const messagePath = `${args.messageBase}.checks.${index}.message`;
        setCurrentOutputMessageForAllLocales({
            messagesByLocale: args.messagesByLocale,
            messagePath,
            value: message,
        });
        entry.message = `@:${messagePath}`;
    });
}

function normalizeCurrentOutputSourceCheckMessageRefs(args: {
    value: unknown;
    messageBase: string;
    messagesByLocale: Record<string, Record<string, unknown>>;
}) {
    if (!Array.isArray(args.value)) return;

    args.value.forEach((entry, index) => {
        if (!isCurrentOutputRecord(entry)) return;
        const message = entry.message;
        if (typeof message !== "string" || message.trim().length === 0 || message.startsWith("@:")) {
            return;
        }
        const messagePath = `${args.messageBase}.sourceChecks.${index}.message`;
        setCurrentOutputMessageForAllLocales({
            messagesByLocale: args.messagesByLocale,
            messagePath,
            value: message,
        });
        entry.message = `@:${messagePath}`;
    });
}

function normalizeCurrentOutputEntryStarterFileRefs(
    value: unknown,
    starterCodeRef: string,
) {
    if (!Array.isArray(value)) return;

    for (const file of value) {
        if (!isCurrentOutputRecord(file)) continue;
        const path = typeof file.path === "string" ? file.path : "";
        const isEntry = file.isEntry === true || file.entry === true || path === "main.sh";
        if (!isEntry) continue;

        const content = file.content;
        if (typeof content === "string" && !content.startsWith("@:")) {
            file.content = starterCodeRef;
        }
    }
}

function normalizeCurrentOutputLearnerFacingRefs(
    topicBundle: TopicBundleManifest,
    messagesByLocale: Record<string, Record<string, unknown>>,
) {
    const exercises = (topicBundle as unknown as { exercises?: unknown }).exercises;
    if (!Array.isArray(exercises)) return;

    for (const exercise of exercises) {
        if (!isCurrentOutputRecord(exercise)) continue;
        const messageBase = typeof exercise.messageBase === "string" ? exercise.messageBase : "";
        if (!messageBase) continue;

        const starterCodeRef = `@:${messageBase}.starterCode`;
        const solutionCodeRef = `@:${messageBase}.solutionCode`;
        const promptRef = `@:${messageBase}.prompt`;

        if (typeof exercise.starterCode === "string" && !exercise.starterCode.startsWith("@:")) {
            setCurrentOutputMessageForAllLocales({
                messagesByLocale,
                messagePath: `${messageBase}.starterCode`,
                value: exercise.starterCode,
            });
            exercise.starterCode = starterCodeRef;
        }

        normalizeCurrentOutputEntryStarterFileRefs(exercise.starterFiles, starterCodeRef);
        normalizeCurrentOutputVisibleStarterFileContentRefs({
            value: exercise.starterFiles,
            messageBase,
            messagesByLocale,
        });

        if (isCurrentOutputRecord(exercise.workspace)) {
            if (
                typeof exercise.workspace.starterCode === "string" &&
                !exercise.workspace.starterCode.startsWith("@:")
            ) {
                exercise.workspace.starterCode = starterCodeRef;
            }

            normalizeCurrentOutputEntryStarterFileRefs(
                exercise.workspace.starterFiles,
                starterCodeRef,
            );
            normalizeCurrentOutputVisibleStarterFileContentRefs({
                value: exercise.workspace.starterFiles,
                messageBase,
                messagesByLocale,
            });
        }

        normalizeCurrentOutputSolutionFileContentRefs({
            value: exercise.solutionFiles,
            messageBase,
            messagesByLocale,
            fallbackEntrySolutionRef: solutionCodeRef,
        });

        normalizeCurrentOutputSourceCheckMessageRefs({
            value: exercise.sourceChecks,
            messageBase,
            messagesByLocale,
        });

        if (isCurrentOutputRecord(exercise.recipe)) {
            const instructions = exercise.recipe.instructions;
            if (typeof instructions === "string" && !instructions.startsWith("@:")) {
                setCurrentOutputMessageForAllLocales({
                    messagesByLocale,
                    messagePath: `${messageBase}.prompt`,
                    value: instructions,
                });
                exercise.recipe.instructions = promptRef;
            }

            const solutionCode = exercise.recipe.solutionCode;
            if (typeof solutionCode === "string" && solutionCode.trim().length > 0 && !solutionCode.startsWith("@:")) {
                setCurrentOutputMessageForAllLocales({
                    messagesByLocale,
                    messagePath: `${messageBase}.solutionCode`,
                    value: solutionCode,
                });
                exercise.recipe.solutionCode = solutionCodeRef;
            }

            normalizeCurrentOutputSolutionFileContentRefs({
                value: exercise.recipe.solutionFiles,
                messageBase,
                messagesByLocale,
                fallbackEntrySolutionRef: solutionCodeRef,
            });

            normalizeCurrentOutputSemanticCheckMessageRefs({
                semanticChecks: exercise.recipe.semanticChecks,
                messageBase,
                messagesByLocale,
            });

            normalizeCurrentOutputSourceCheckMessageRefs({
                value: exercise.recipe.sourceChecks,
                messageBase,
                messagesByLocale,
            });
        }
    }
}

function normalizeCurrentOutputWorkspacePath(path: string) {
    const parts = path.split("/").filter(Boolean);
    return `/${parts.join("/")}`;
}

function joinCurrentOutputWorkspacePath(base: string, segment: string) {
    if (!segment || segment === ".") return normalizeCurrentOutputWorkspacePath(base);
    if (segment.startsWith("/")) return normalizeCurrentOutputWorkspacePath(segment);
    return normalizeCurrentOutputWorkspacePath(`${base}/${segment}`);
}

function parentCurrentOutputWorkspacePath(path: string) {
    const parts = normalizeCurrentOutputWorkspacePath(path).split("/").filter(Boolean);
    if (parts.length <= 1) return "/workspace";
    parts.pop();
    return `/${parts.join("/")}`;
}

function readCurrentOutputEntrySolutionScript(exercise: Record<string, unknown>) {
    const solutionFiles = exercise.solutionFiles;
    if (!Array.isArray(solutionFiles)) return undefined;

    for (const file of solutionFiles) {
        if (!isCurrentOutputRecord(file)) continue;
        const path = typeof file.path === "string" ? file.path : "";
        const isEntry = file.isEntry === true || file.entry === true || path === "main.sh";
        if (isEntry && typeof file.content === "string") return file.content;
    }

    return undefined;
}

function simulateCurrentOutputShellCwd(startCwd: string, script: string) {
    let cwd = normalizeCurrentOutputWorkspacePath(startCwd || "/workspace");

    for (const rawLine of script.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const match = line.match(/^cd\s+([^;&|]+)$/);
        if (!match) continue;

        const target = match[1]?.trim().replace(/^["']|["']$/g, "");
        if (!target || target === "." || target === "-") continue;
        if (target === "..") {
            cwd = parentCurrentOutputWorkspacePath(cwd);
            continue;
        }
        cwd = joinCurrentOutputWorkspacePath(cwd, target);
    }

    return cwd;
}

function isCurrentOutputTerminalWorkspaceExercise(exercise: Record<string, unknown>) {
    const ideConfig = exercise.ideConfig;
    const recipe = exercise.recipe;
    const workspace = exercise.workspace;

    return (
        (isCurrentOutputRecord(ideConfig) &&
            (ideConfig.layoutMode === "terminal_workspace" || ideConfig.runnerBackend === "pty")) ||
        (isCurrentOutputRecord(recipe) && recipe.mode === "terminal_workspace") ||
        (isCurrentOutputRecord(workspace) && workspace.language === "bash") ||
        exercise.language === "bash"
    );
}


function cloneCurrentOutputRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function currentOutputStarterSupportFiles(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];

    return value
        .filter((entry): entry is Record<string, unknown> => {
            if (!isCurrentOutputRecord(entry)) return false;
            return !isCurrentOutputEntryStarterFile(entry);
        })
        .map((entry) => cloneCurrentOutputRecord(entry));
}

function mergeCurrentOutputFileListByPath(
    existing: unknown,
    additions: Record<string, unknown>[],
): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = [];
    const seen = new Set<string>();

    if (Array.isArray(existing)) {
        for (const item of existing) {
            if (!isCurrentOutputRecord(item)) continue;
            const path = typeof item.path === "string" ? item.path : "";
            if (!path || seen.has(path)) continue;
            seen.add(path);
            result.push(item);
        }
    }

    for (const item of additions) {
        const path = typeof item.path === "string" ? item.path : "";
        if (!path || seen.has(path)) continue;
        seen.add(path);
        result.push(item);
    }

    return result;
}

function normalizeCurrentOutputStarterSupportFilesAsFixtures(topicBundle: TopicBundleManifest) {
    const exercises = (topicBundle as unknown as { exercises?: unknown }).exercises;
    if (!Array.isArray(exercises)) return;

    for (const exercise of exercises) {
        if (!isCurrentOutputRecord(exercise)) continue;
        if (!isCurrentOutputTerminalWorkspaceExercise(exercise)) continue;

        const supportFiles = currentOutputStarterSupportFiles(exercise.starterFiles);
        if (supportFiles.length === 0) continue;

        exercise.fixtureFiles = mergeCurrentOutputFileListByPath(
            exercise.fixtureFiles,
            supportFiles.map((file) => cloneCurrentOutputRecord(file)),
        );

        const workspace = isCurrentOutputRecord(exercise.workspace)
            ? exercise.workspace
            : {};
        exercise.workspace = workspace;

        workspace.fixtureFiles = mergeCurrentOutputFileListByPath(
            workspace.fixtureFiles,
            supportFiles.map((file) => cloneCurrentOutputRecord(file)),
        );
    }
}

function currentOutputTerminalBootstrap(value: unknown) {
    if (!isCurrentOutputRecord(value)) return undefined;

    const gitSafeDirectories = Array.isArray(value.gitSafeDirectories)
        ? value.gitSafeDirectories
              .map((entry) => String(entry ?? "").trim())
              .filter(Boolean)
        : [];
    const setupScriptPath =
        typeof value.setupScriptPath === "string"
            ? value.setupScriptPath.trim()
            : "";
    const workspaceStateKey =
        typeof value.workspaceStateKey === "string"
            ? value.workspaceStateKey.trim()
            : "";

    return mergeManifestTerminalBootstraps({
        ...(gitSafeDirectories.length > 0 ? { gitSafeDirectories } : {}),
        ...(setupScriptPath ? { setupScriptPath } : {}),
        ...(workspaceStateKey ? { workspaceStateKey } : {}),
    });
}

function currentOutputBootstrapFiles(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value
        .filter(isCurrentOutputRecord)
        .map((file) => ({
            kind:
                file.kind === "directory"
                    ? ("directory" as const)
                    : ("file" as const),
            path: typeof file.path === "string" ? file.path : "",
            name: typeof file.name === "string" ? file.name : "",
            content: file.content,
            language: file.language,
            readOnly: file.readOnly === true,
        }))
        .filter((file) => Boolean(file.path || file.name));
}

function normalizeCurrentOutputTerminalBootstraps(topicBundle: TopicBundleManifest) {
    const bundle = topicBundle as unknown as {
        serviceDefaults?: unknown;
        exercises?: unknown;
    };
    if (!Array.isArray(bundle.exercises)) return;

    const topicServiceDefaults = isCurrentOutputRecord(bundle.serviceDefaults)
        ? bundle.serviceDefaults
        : {};
    const topicBootstrap = currentOutputTerminalBootstrap(
        topicServiceDefaults.terminalBootstrap,
    );

    for (const exercise of bundle.exercises) {
        if (!isCurrentOutputRecord(exercise)) continue;
        if (!isCurrentOutputTerminalWorkspaceExercise(exercise)) continue;

        const ideConfig = isCurrentOutputRecord(exercise.ideConfig)
            ? exercise.ideConfig
            : {};
        const serviceOverrides = isCurrentOutputRecord(exercise.serviceOverrides)
            ? exercise.serviceOverrides
            : {};
        const workspace = isCurrentOutputRecord(exercise.workspace)
            ? exercise.workspace
            : {};
        const fixtureFiles = mergeCurrentOutputFileListByPath(
            exercise.fixtureFiles,
            Array.isArray(workspace.fixtureFiles)
                ? workspace.fixtureFiles.filter(isCurrentOutputRecord)
                : [],
        );
        const terminalCwd =
            typeof ideConfig.terminalCwd === "string"
                ? ideConfig.terminalCwd
                : typeof serviceOverrides.terminalCwd === "string"
                  ? serviceOverrides.terminalCwd
                  : "/workspace";
        const terminalBootstrap = deriveManifestTerminalBootstrap({
            bootstrap: mergeManifestTerminalBootstraps(
                topicBootstrap,
                currentOutputTerminalBootstrap(
                    serviceOverrides.terminalBootstrap,
                ),
                currentOutputTerminalBootstrap(ideConfig.terminalBootstrap),
            ),
            terminalCwd,
            files: currentOutputBootstrapFiles(fixtureFiles),
        });

        if (!terminalBootstrap) continue;

        exercise.ideConfig = {
            ...ideConfig,
            terminalBootstrap,
        };

        if (Object.keys(serviceOverrides).length > 0) {
            exercise.serviceOverrides = {
                ...serviceOverrides,
                terminalBootstrap,
            };
        }
    }
}

function normalizeCurrentOutputProgressiveProjectTerminalCwd(topicBundle: TopicBundleManifest) {
    const bundle = topicBundle as unknown as { cards?: unknown; exercises?: unknown };
    if (!Array.isArray(bundle.cards) || !Array.isArray(bundle.exercises)) return;

    const exercisesById = new Map<string, Record<string, unknown>>();
    for (const exercise of bundle.exercises) {
        if (!isCurrentOutputRecord(exercise)) continue;
        if (typeof exercise.id === "string") exercisesById.set(exercise.id, exercise);
    }

    for (const card of bundle.cards) {
        if (
            !isCurrentOutputRecord(card) ||
            card.kind !== "project" ||
            !isCurrentOutputRecord(card.project)
        ) {
            continue;
        }

        const steps = card.project.steps;
        if (!Array.isArray(steps)) continue;

        let cwd = "/workspace";
        for (const step of steps) {
            if (!isCurrentOutputRecord(step) || typeof step.exerciseKey !== "string") continue;
            const exercise = exercisesById.get(step.exerciseKey);
            if (!exercise || !isCurrentOutputTerminalWorkspaceExercise(exercise)) continue;

            if (!isCurrentOutputRecord(exercise.ideConfig)) {
                exercise.ideConfig = {};
            }
            (exercise.ideConfig as Record<string, unknown>).terminalCwd = cwd;

            const script = readCurrentOutputEntrySolutionScript(exercise);
            if (script) {
                cwd = simulateCurrentOutputShellCwd(cwd, script);
            }
        }
    }
}

function setCurrentOutputDottedMessageValue(
    target: Record<string, unknown>,
    dottedPath: string,
    value: string,
) {
    const parts = dottedPath
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length === 0) return;

    let cursor: Record<string, unknown> = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
        const part = parts[index];
        const next = cursor[part];
        if (!next || typeof next !== "object" || Array.isArray(next)) {
            cursor[part] = {};
        }
        cursor = cursor[part] as Record<string, unknown>;
    }

    const leaf = parts[parts.length - 1];
    if (typeof cursor[leaf] !== "string" || String(cursor[leaf]).trim().length === 0) {
        cursor[leaf] = value;
    }
}

function normalizeCurrentOutputTerminalExpectationMessageRefs(
    topicBundle: TopicBundleManifest,
    messagesByLocale: Record<string, Record<string, unknown>>,
) {
    const exercises = (topicBundle as unknown as { exercises?: unknown }).exercises;
    if (!Array.isArray(exercises)) return;

    for (const exercise of exercises) {
        if (!exercise || typeof exercise !== "object" || Array.isArray(exercise)) continue;
        const record = exercise as Record<string, unknown>;
        const messageBase = typeof record.messageBase === "string" ? record.messageBase : "";
        if (!messageBase) continue;

        const terminalExpectations = record.terminalExpectations;
        if (!terminalExpectations || typeof terminalExpectations !== "object" || Array.isArray(terminalExpectations)) {
            continue;
        }

        const expectationRecord = terminalExpectations as Record<string, unknown>;
        const normalizeCommandMessages = (kind: "requiredCommands" | "forbiddenCommands") => {
            const entries = expectationRecord[kind];
            if (!Array.isArray(entries)) return;

            entries.forEach((entry, index) => {
                if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
                const command = entry as Record<string, unknown>;
                const message = command.message;
                if (typeof message !== "string" || message.trim().length === 0 || message.startsWith("@:")) {
                    return;
                }

                const field = `terminalExpectations.${kind}.${index}.message`;
                const messagePath = `${messageBase}.${field}`;
                for (const localeMessages of Object.values(messagesByLocale)) {
                    setCurrentOutputDottedMessageValue(localeMessages, messagePath, message);
                }
                command.message = `@:${messagePath}`;
            });
        };

        normalizeCommandMessages("requiredCommands");
        normalizeCommandMessages("forbiddenCommands");
    }
}

export function normalizeCurrentDraftOutputForSeed(args: {
    seed: ReturnType<typeof buildTopicSeedFromPlanNode>;
    topicBundle: TopicBundleManifest;
    messagesByLocale: Record<string, Record<string, unknown>>;
}) {
    const currentIdentity = args.topicBundle as {
        subjectSlug?: unknown;
        moduleSlug?: unknown;
        sectionSlug?: unknown;
        topicId?: unknown;
        prefix?: unknown;
    };

    const resolvedSectionSlug = resolveLogicalSectionSlug({
        subjectSlug: args.seed.subjectSlug,
        rawSectionSlug: args.seed.sectionSlug,
    });

    const replacements = uniqueIdentityReplacements([
        [currentIdentity.subjectSlug, args.seed.subjectSlug],
        [currentIdentity.moduleSlug, args.seed.moduleSlug],
        [currentIdentity.sectionSlug, resolvedSectionSlug],
        [currentIdentity.topicId, args.seed.topicId],
        [currentIdentity.prefix, args.seed.modulePrefix],
    ]);

    const topicBundle = replaceKnownIdentityStrings(
        args.topicBundle,
        replacements,
    ) as TopicBundleManifest;

    Object.assign(topicBundle as Record<string, unknown>, {
        subjectSlug: args.seed.subjectSlug,
        moduleSlug: args.seed.moduleSlug,
        sectionSlug: resolvedSectionSlug,
        topicId: args.seed.topicId,
        prefix: args.seed.modulePrefix,
        minutes: args.seed.minutes,
    });

    normalizeCurrentOutputProgressiveProjectTerminalCwd(topicBundle);

    const replacedMessagesByLocale = replaceKnownIdentityStrings(
        args.messagesByLocale,
        replacements,
    ) as Record<string, Record<string, unknown>>;
    const messagesByLocale = normalizeCurrentDraftMessagePathsForSeed({
        seed: args.seed,
        messagesByLocale: replacedMessagesByLocale,
    });

    normalizeCurrentOutputLearnerFacingRefs(topicBundle, messagesByLocale);
    normalizeCurrentOutputStarterSupportFilesAsFixtures(topicBundle);
    normalizeCurrentOutputTerminalBootstraps(topicBundle);
    normalizeCurrentOutputTerminalExpectationMessageRefs(topicBundle, messagesByLocale);

    return { topicBundle, messagesByLocale, replacements };
}

export async function rebuildSubjectFromDraftReports(args: {
    blueprint: CourseBlueprint;
    plan: CoursePlan;
    spec?: CourseSpec | null;
    onProgress?: CompileProgressCallback;
    rebuildDraftSource?: RebuildDraftSourcePreference;
    syncReports?: boolean;
    validation?: CompileValidationSkipOptions;
}) {
    const shape = getSubjectShape(args.blueprint.profileId);
    const profileServices = getProfileServices(args.blueprint.profileId);
    const topicNodes = listTopicPlanNodes({ plan: args.plan });
    const rebuildDraftSource = args.rebuildDraftSource ?? "reports";
    const syncReports = args.syncReports ?? true;
    const validationState = resolveCompileValidationState(args.validation);
    const totalTopics = topicNodes.length;
    let completedTopics = 0;

    const sourceLocale = args.blueprint.sourceLocale;
    const extraLocales = (args.blueprint.targetLocales ?? []).filter(
        (locale) => locale !== sourceLocale,
    );

    args.onProgress?.({
        current: completedTopics,
        total: totalTopics,
        stage: "building subject manifest from saved drafts",
    });

    const subjectManifest = buildSubjectManifestFromPlan({
        blueprint: args.blueprint,
        plan: args.plan,
        shape,
    });

    const sourceSubjectMessages = buildSubjectMessagesFromPlan({
        blueprint: args.blueprint,
        plan: args.plan,
        shape,
    });

    assertNonEmptyMessages({
        locale: sourceLocale,
        label: `${args.blueprint.subjectSlug} subject messages`,
        messages: sourceSubjectMessages,
    });

    await writeSubjectArtifacts({
        subjectSlug: args.blueprint.subjectSlug,
        subjectManifest,
        subjectMessagesByLocale: {
            [sourceLocale]: sourceSubjectMessages,
        },
    });

    for (const node of topicNodes) {
        const seed = buildTopicSeedFromPlanNode({
            blueprint: args.blueprint,
            spec: args.spec ?? null,
            module: node.module,
            section: node.section,
            topic: node.topic,
        });

        args.onProgress?.({
            current: completedTopics,
            total: totalTopics,
            stage: "reading saved topic draft",
            topicId: node.topic.topicId,
            moduleSlug: node.module.moduleSlug,
            sectionSlug: node.section.sectionSlug,
        });

        if (rebuildDraftSource === "current-output") {
            const currentOutput = await readCurrentDraftOutputForRebuild({
                subjectSlug: args.blueprint.subjectSlug,
                moduleOrder: node.moduleIndex,
                topicId: node.topic.topicId,
                sourceLocale,
                extraLocales,
            });

            const normalizedCurrentOutput = normalizeCurrentDraftOutputForSeed({
                seed,
                topicBundle: currentOutput.topicBundle,
                messagesByLocale: currentOutput.messagesByLocale,
            });

            validateTopicBundleIdentity({
                seed,
                topicBundle: normalizedCurrentOutput.topicBundle,
                location: `${seed.moduleSlug}/${seed.sectionSlug}/${seed.topicId}`,
            });

            const sourceMessages = normalizedCurrentOutput.messagesByLocale[sourceLocale];

            validateTopicMessagesIdentity({
                seed,
                messages: sourceMessages,
                location: `${seed.moduleSlug}/${seed.sectionSlug}/${seed.topicId}`,
            });

            assertNonEmptyMessages({
                locale: sourceLocale,
                label: `${args.blueprint.subjectSlug}/${node.topic.topicId} topic messages`,
                messages: sourceMessages,
            });

            await writeTopicArtifacts({
                subjectSlug: args.blueprint.subjectSlug,
                moduleOrder: node.moduleIndex,
                topicId: node.topic.topicId,
                topicBundle: normalizedCurrentOutput.topicBundle,
                messagesByLocale: normalizedCurrentOutput.messagesByLocale,
            });

            const hashes = buildTopicAttemptHashes({
                seed,
                prompt: {
                    system: "rebuild-from-drafts",
                    user: "current-draft-output",
                },
                topicBundle: normalizedCurrentOutput.topicBundle,
            });

            if (syncReports) {
                await writeTopicReports({
                    subjectSlug: args.blueprint.subjectSlug,
                    moduleOrder: node.moduleIndex,
                    topicId: node.topic.topicId,
                    hashes,
                    topicBundle: normalizedCurrentOutput.topicBundle,
                    topicMessagesByLocale: normalizedCurrentOutput.messagesByLocale,
                    validationState,
                    rebuildSource: {
                        mode: "rebuild-from-drafts",
                        source: currentOutput.source,
                        sourceBundlePath: currentOutput.sourceBundlePath,
                        sourceMessagesPaths: currentOutput.sourceMessagesPaths,
                        identityNormalized:
                            normalizedCurrentOutput.replacements.length > 0,
                        identityReplacements: normalizedCurrentOutput.replacements,
                        syncedReports: true,
                    },
                });
            }

            await writeTopicCompileStatus({
                reportDir: getTopicReportDir({
                    subjectSlug: args.blueprint.subjectSlug,
                    moduleOrder: node.moduleIndex,
                    topicId: node.topic.topicId,
                }),
                status: "success",
                attempts: 0,
                finalAttempt: 0,
                mode: "rebuild-from-drafts",
                sourceDraft: currentOutput.source,
                validationState,
            });

            completedTopics += 1;
            args.onProgress?.({
                current: completedTopics,
                total: totalTopics,
                stage: "synced current draft output",
                topicId: node.topic.topicId,
                moduleSlug: node.module.moduleSlug,
                sectionSlug: node.section.sectionSlug,
            });
            continue;
        }

        const savedDraft = await readSavedDraftForRebuild({
            subjectSlug: args.blueprint.subjectSlug,
            moduleOrder: node.moduleIndex,
            topicId: node.topic.topicId,
        });
        const draft = savedDraft.draft;

        const workspacePolicy = resolveWorkspacePolicy({
            blueprint: args.blueprint,
            moduleNumber:
                        typeof node.module.moduleNumber === "number" && Number.isFinite(node.module.moduleNumber)
                            ? node.module.moduleNumber
                            : node.module.order - 1,
            topicId: node.topic.topicId,
        });

        validateWorkspacePolicy({
            text: draft,
            policy: workspacePolicy,
            location: `${node.module.moduleSlug}/${node.topic.topicId}`,
            retryable: false,
        });
        assertTopicAuthoringDraft(draft);
        validateStarterCodeDoesNotRevealSolution({
            draft,
            location: `${node.module.moduleSlug}/${node.section.sectionSlug}/${node.topic.topicId}`,
        });
        validateGenericExerciseHelp({
            draft,
            location: `${node.module.moduleSlug}/${node.section.sectionSlug}/${node.topic.topicId}`,
        });
        validateNoDummyFillBlankQuestions({
            draft,
            location: `${node.module.moduleSlug}/${node.section.sectionSlug}/${node.topic.topicId}`,
        });

        args.onProgress?.({
            current: completedTopics,
            total: totalTopics,
            stage: "rebuilding topic bundle",
            topicId: node.topic.topicId,
            moduleSlug: node.module.moduleSlug,
            sectionSlug: node.section.sectionSlug,
        });

        const topicBundle = buildTopicBundleFromDraft({
            shape,
            seed,
            draft,
        });

        validateTopicBundleIdentity({
            seed,
            topicBundle,
            location: `${seed.moduleSlug}/${seed.sectionSlug}/${seed.topicId}`,
        });

        const qualityReport = buildCurriculumQualityReport({
            profileId: args.blueprint.profileId,
            subjectSlug: args.blueprint.subjectSlug,
            courseSlug: args.blueprint.courseSlug,
            topics: [{ seed, draft, topicBundle }],
        });
        const blockers = qualityFailures(qualityReport);

        if (!validationState.qualityGates.skipped && blockers.length > 0) {
            throw new Error(
                [
                    `Cannot rebuild topic "${node.topic.topicId}" because the saved draft fails the quality gate.`,
                    ...blockers.map((issue) => `- ${issue.message}`),
                    `Report dir: ${getTopicReportDir({
                        subjectSlug: args.blueprint.subjectSlug,
                        moduleOrder: node.moduleIndex,
                        topicId: node.topic.topicId,
                    })}`,
                ].join("\n"),
            );
        }

        const goldenReport = validationState.golden.skipped
            ? {
                  topicId: seed.topicId,
                  ok: true,
                  issues: [],
              }
            : await profileServices.validateGolden({
                  seed,
                  draft,
                  topicBundle,
              });
        const goldenErrors = goldenFailures(goldenReport);

        if (!validationState.golden.skipped && goldenErrors.length > 0) {
            throw new Error(
                [
                    `Cannot rebuild topic "${node.topic.topicId}" because the saved draft fails golden validation.`,
                    ...goldenErrors.map((issue) => `- ${issue.message}`),
                    `Report dir: ${getTopicReportDir({
                        subjectSlug: args.blueprint.subjectSlug,
                        moduleOrder: node.moduleIndex,
                        topicId: node.topic.topicId,
                    })}`,
                ].join("\n"),
            );
        }

        const sourceMessages = buildMessagesFromDraft({
            shape,
            seed,
            draft,
        });

        validateTopicMessagesIdentity({
            seed,
            messages: sourceMessages,
            location: `${seed.moduleSlug}/${seed.sectionSlug}/${seed.topicId}`,
        });

        assertNonEmptyMessages({
            locale: sourceLocale,
            label: `${args.blueprint.subjectSlug}/${node.topic.topicId} topic messages`,
            messages: sourceMessages,
        });

        const messagesByLocale: Record<string, Record<string, unknown>> = {
            [sourceLocale]: sourceMessages,
        };

        for (const locale of extraLocales) {
            const existingMessages = await readExistingLocaleMessages({
                locale,
                subjectSlug: args.blueprint.subjectSlug,
                moduleOrder: node.moduleIndex,
                topicId: node.topic.topicId,
            });

            if (existingMessages) {
                messagesByLocale[locale] = existingMessages;
            }
        }

        await writeTopicArtifacts({
            subjectSlug: args.blueprint.subjectSlug,
            moduleOrder: node.moduleIndex,
            topicId: node.topic.topicId,
            topicBundle,
            messagesByLocale,
        });

        const hashes = buildTopicAttemptHashes({
            seed,
            prompt: {
                system: "rebuild-from-drafts",
                user: savedDraft.source,
            },
            repairedDraft: draft,
            topicBundle,
        });

        if (syncReports) {
            await writeTopicReports({
                subjectSlug: args.blueprint.subjectSlug,
                moduleOrder: node.moduleIndex,
                topicId: node.topic.topicId,
                repairedDraft: draft,
                hashes,
                goldenReport,
                qualityReport,
                validationState,
                topicBundle,
                topicMessagesByLocale: messagesByLocale,
                rebuildSource: {
                    mode: "rebuild-from-drafts",
                    source: "report-draft",
                    sourceDraft: savedDraft.source,
                    syncedReports: true,
                },
            });
        }

        await writeTopicCompileStatus({
            reportDir: getTopicReportDir({
                subjectSlug: args.blueprint.subjectSlug,
                moduleOrder: node.moduleIndex,
                topicId: node.topic.topicId,
            }),
            status: "success",
            attempts: 0,
            finalAttempt: 0,
            mode: "rebuild-from-drafts",
            sourceDraft: savedDraft.source,
            validationState,
        });

        completedTopics += 1;
        args.onProgress?.({
            current: completedTopics,
            total: totalTopics,
            stage: "rebuilt topic from saved draft",
            topicId: node.topic.topicId,
            moduleSlug: node.module.moduleSlug,
            sectionSlug: node.section.sectionSlug,
        });
    }

    await writeCourseQualityReport({
        subjectSlug: args.blueprint.subjectSlug,
        report: await buildCourseQualityReportFromArtifacts({
            blueprint: args.blueprint,
            plan: args.plan,
            spec: args.spec ?? null,
        }),
    });

    args.onProgress?.({
        current: totalTopics,
        total: totalTopics,
        stage: "done rebuilding from saved drafts",
    });

    return {
        shape,
        subjectManifest,
    };
}
