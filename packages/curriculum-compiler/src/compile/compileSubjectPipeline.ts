// packages/curriculum-compiler/src/compile/compileSubjectPipeline.ts

import fs from "node:fs/promises";
import path from "node:path";
import type {
    CourseBlueprint,
    CoursePlan,
    CourseSpec,
    TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import type { AiProvider, TopicRetryContext } from "@zoeskoul/curriculum-ai";
import { generateTopicAuthoringDraftAttempt } from "@zoeskoul/curriculum-ai";
import {
    getProfileServices,
    getSubjectShape,
} from "@zoeskoul/curriculum-profiles";
import {
    getDraftReportsRoot,
    getDraftTopicBundlePath,
    getDraftTopicMessagesPath,
} from "@zoeskoul/curriculum-core";
import { buildSubjectManifestFromPlan } from "../emit/buildSubjectManifestFromPlan.js";
import { buildSubjectMessagesFromPlan } from "../emit/buildSubjectMessagesFromPlan.js";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { buildMessagesFromDraft } from "../emit/buildMessagesFromDraft.js";
import {
    assertNonEmptyMessages,
    translateNonEmptyMessages,
} from "../emit/translateNonEmptyMessages.js";
import { assertTopicAuthoringDraft } from "../validate/assertTopicAuthoringDraft.js";
import type { CurriculumQualityReport } from "../quality/buildCurriculumQualityReport.js";
import { writeSubjectArtifacts } from "../write/writeSubjectArtifacts.js";
import { writeTopicArtifacts } from "../write/writeTopicArtifacts.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { writeTopicAttemptReport } from "../reports/writeTopicAttemptReport.js";
import { writeTopicCompileStatus } from "../reports/writeTopicCompileStatus.js";
import { writeCourseQualityReport } from "../reports/writeCourseQualityReport.js";
import { buildCourseQualityReportFromArtifacts } from "../reports/buildCourseQualityReportFromArtifacts.js";
import {
    buildTopicAttemptHashes,
    buildTopicAttemptMetadata,
    extractGenerationDiagnostics,
} from "../reports/topicGenerationAudit.js";
import { evaluateTopicDraft } from "../quality/evaluateTopicDraft.js";
import { buildCurriculumQualityReport } from "../quality/buildCurriculumQualityReport.js";
import type { CompileProgressCallback } from "./compileProgress.js";
import { extractRetryIssues } from "./topicRetryContext.js";
import { listTopicPlanNodes } from "../plan/listTopicPlanNodes.js";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";
import { validateWorkspacePolicy } from "../validate/validateWorkspacePolicy.js";
import { resolveWorkspacePolicy } from "../policy/resolveWorkspacePolicy.js";
import { validateTopicBundleIdentity } from "../validate/validateTopicBundleIdentity.js";
import { validateTopicMessagesIdentity } from "../validate/validateTopicMessagesIdentity.js";
import { validateGenericExerciseHelp } from "../validate/validateGenericExerciseHelp.js";
import { validateStarterCodeDoesNotRevealSolution } from "../validate/validateStarterCodeDoesNotRevealSolution.js";
import { validateNoDummyFillBlankQuestions } from "../validate/validateNoDummyFillBlankQuestions.js";
import {
    isRetryableTopicValidationError,
    RetryableTopicValidationError,
} from "../validate/RetryableTopicValidationError.js";
import type { CompileValidationSkipOptions, CompileValidationState } from "./validationState.js";
import { resolveCompileValidationState } from "./validationState.js";

const MAX_TOPIC_RETRIES = 2;

async function fileExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readJsonIfExists(filePath: string): Promise<any | null> {
    try {
        return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
        return null;
    }
}

function getTopicReportDir(args: {
    subjectSlug: string;
    moduleOrder: number;
    topicId: string;
}) {
    return path.join(
        getDraftReportsRoot(args.subjectSlug),
        `module${args.moduleOrder}`,
        args.topicId,
    );
}

async function isTopicAlreadyCompiled(args: {
    subjectSlug: string;
    moduleOrder: number;
    topicId: string;
    locales: string[];
}) {
    const reportDir = getTopicReportDir(args);
    const status = await readJsonIfExists(path.join(reportDir, "compile-status.json"));

    if (status?.status !== "success") {
        return false;
    }

    const moduleDir = `module${args.moduleOrder}`;
    const bundlePath = getDraftTopicBundlePath(
        args.subjectSlug,
        moduleDir,
        args.topicId,
    );

    if (!(await fileExists(bundlePath))) {
        return false;
    }

    for (const locale of args.locales) {
        const messagesPath = getDraftTopicMessagesPath(
            locale,
            args.subjectSlug,
            moduleDir,
            args.topicId,
        );

        if (!(await fileExists(messagesPath))) {
            return false;
        }
    }

    return true;
}

function formatReportErrors(args: {
    title: string;
    topicId: string;
    moduleSlug: string;
    sectionSlug: string;
    reportDir: string;
    messages: string[];
}) {
    return [
        `${args.title} for topic "${args.topicId}"`,
        `Module: ${args.moduleSlug}`,
        `Section: ${args.sectionSlug}`,
        `Report dir: ${args.reportDir}`,
        ...args.messages.map((message) => `- ${message}`),
    ].join("\n");
}

function throwRetryableReportFailure(args: {
    code: string;
    title: string;
    topicId: string;
    moduleSlug: string;
    sectionSlug: string;
    reportDir: string;
    messages: string[];
    details?: unknown;
}): never {
    throw new RetryableTopicValidationError({
        code: args.code,
        message: formatReportErrors(args),
        details: args.details,
    });
}

function errorCode(error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error) {
        return String((error as any).code ?? "UNKNOWN");
    }

    return "UNKNOWN";
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

async function writeRetrySummary(args: {
    subjectSlug: string;
    validationState: CompileValidationState;
    topics: Array<{
        moduleSlug: string;
        sectionSlug: string;
        topicId: string;
        status: "success" | "failed";
        attempts: number;
        retryCodes: string[];
    }>;
}) {
    const dir = getDraftReportsRoot(args.subjectSlug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
        path.join(dir, "retry-summary.json"),
        JSON.stringify(
            {
                subjectSlug: args.subjectSlug,
                generatedAt: new Date().toISOString(),
                validationState: args.validationState,
                topics: args.topics,
            },
            null,
            2,
        ),
    );
}

export async function compileSubjectPipeline(args: {
    blueprint: CourseBlueprint;
    plan: CoursePlan;
    spec?: CourseSpec | null;
    provider: AiProvider;
    translationProvider?: AiProvider;
    onProgress?: CompileProgressCallback;
    resume?: boolean;
    validation?: CompileValidationSkipOptions;
}) {
    const shape = getSubjectShape(args.blueprint.profileId);
    const translationProvider = args.translationProvider ?? args.provider;
    const profileServices = getProfileServices(args.blueprint.profileId);
    const validationState = resolveCompileValidationState(args.validation);

    const topicNodes = listTopicPlanNodes({ plan: args.plan });
    const totalTopics = topicNodes.length;
    let completedTopics = 0;

    const sourceLocale = args.blueprint.sourceLocale;
    const extraLocales = (args.blueprint.targetLocales ?? []).filter(
        (locale) => locale !== sourceLocale,
    );

    const retrySummary: Array<{
        moduleSlug: string;
        sectionSlug: string;
        topicId: string;
        status: "success" | "failed";
        attempts: number;
        retryCodes: string[];
    }> = [];
    args.onProgress?.({
        current: completedTopics,
        total: totalTopics,
        stage: "building subject manifest",
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

    const subjectMessagesByLocale: Record<string, Record<string, unknown>> = {
        [sourceLocale]: sourceSubjectMessages,
    };

    for (const locale of extraLocales) {
        args.onProgress?.({
            current: completedTopics,
            total: totalTopics,
            stage: `translating subject messages (${locale})`,
        });

        subjectMessagesByLocale[locale] = await translateNonEmptyMessages({
            provider: translationProvider,
            shape,
            sourceLocale,
            locale,
            sourceMessages: sourceSubjectMessages,
            label: `${args.blueprint.subjectSlug} subject messages`,
        });
    }

    args.onProgress?.({
        current: completedTopics,
        total: totalTopics,
        stage: "writing subject artifacts",
    });

    await writeSubjectArtifacts({
        subjectSlug: args.blueprint.subjectSlug,
        subjectManifest,
        subjectMessagesByLocale,
    });

    for (const node of topicNodes) {
        const reportDir = getTopicReportDir({
            subjectSlug: args.blueprint.subjectSlug,
            moduleOrder: node.moduleIndex,
            topicId: node.topic.topicId,
        });

        if (args.resume) {
            const alreadyCompiled = await isTopicAlreadyCompiled({
                subjectSlug: args.blueprint.subjectSlug,
                moduleOrder: node.moduleIndex,
                topicId: node.topic.topicId,
                locales: [sourceLocale, ...extraLocales],
            });

            if (alreadyCompiled) {
                completedTopics += 1;

                args.onProgress?.({
                    current: completedTopics,
                    total: totalTopics,
                    stage: "skipped completed topic",
                    topicId: node.topic.topicId,
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                });

                retrySummary.push({
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                    topicId: node.topic.topicId,
                    status: "success",
                    attempts: 0,
                    retryCodes: [],
                });

                continue;
            }
        }

        const seed = buildTopicSeedFromPlanNode({
            blueprint: args.blueprint,
            spec: args.spec ?? null,
            module: node.module,
            section: node.section,
            topic: node.topic,
        });

        const retryCodes: string[] = [];
        let finalAttempts = 0;
        let previousError: unknown = null;

        for (let attempt = 0; attempt <= MAX_TOPIC_RETRIES; attempt += 1) {
            finalAttempts = attempt + 1;
            const retryContext: TopicRetryContext | undefined =
                attempt > 0 && previousError instanceof Error
                    ? {
                          attempt,
                          maxRetries: MAX_TOPIC_RETRIES,
                          previousErrorCode: errorCode(previousError),
                          previousErrorMessage: previousError.message,
                          qualityIssues: extractRetryIssues(previousError),
                      }
                    : undefined;

            const attemptArtifacts: {
                prompt?: {
                    system: string;
                    user: string;
                };
                rawModelOutput?: string;
                parsedOutput?: unknown;
                rawDraft?: TopicAuthoringDraft;
                normalizedDraft?: TopicAuthoringDraft;
                repairedDraft?: TopicAuthoringDraft;
                validationResult?: unknown;
                attemptMetadata?: unknown;
                hashes?: unknown;
                repairReport?: unknown;
                critiqueReport?: unknown;
                semanticReport?: unknown;
                goldenReport?: unknown;
                qualityReport?: CurriculumQualityReport;
                validationState?: CompileValidationState;
                topicBundle?: unknown;
            } = {
                validationState,
            };

            try {
                args.onProgress?.({
                    current: completedTopics,
                    total: totalTopics,
                    stage: attempt > 0 ? `retrying topic draft (${attempt}/${MAX_TOPIC_RETRIES})` : "generating topic draft",
                    topicId: node.topic.topicId,
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                });

                let generationAttempt;
                try {
                    generationAttempt = await generateTopicAuthoringDraftAttempt(args.provider, {
                        seed,
                        locale: sourceLocale,
                        shape,
                        retry: retryContext,
                    });
                } catch (error) {
                    const diagnostics = extractGenerationDiagnostics(error);
                    const prompt =
                        error && typeof error === "object" && "prompt" in error
                            ? ((error as { prompt?: { system: string; user: string } }).prompt ?? {
                                system: "",
                                user: "",
                            })
                            : { system: "", user: "" };

                    attemptArtifacts.prompt = prompt;
                    attemptArtifacts.rawModelOutput = diagnostics.rawModelOutput;
                    attemptArtifacts.parsedOutput = diagnostics.parsedOutput;
                    attemptArtifacts.validationResult =
                        diagnostics.validationResult ??
                        (diagnostics.rawModelOutput || diagnostics.parsedOutput
                            ? {
                                ok: false,
                                errors: [error instanceof Error ? error.message : String(error)],
                            }
                            : undefined);
                    attemptArtifacts.attemptMetadata = buildTopicAttemptMetadata({
                        seed,
                        generation: diagnostics.generation,
                        retryAttempt: attempt,
                        maxRetries: MAX_TOPIC_RETRIES,
                    });
                    attemptArtifacts.hashes = buildTopicAttemptHashes({
                        seed,
                        prompt,
                        rawModelOutput: diagnostics.rawModelOutput,
                        parsedOutput: diagnostics.parsedOutput,
                    });

                    throw new RetryableTopicValidationError({
                        code: "TOPIC_GENERATION_OUTPUT_INVALID",
                        message: error instanceof Error ? error.message : String(error),
                        details: { topicId: node.topic.topicId },
                    });
                }

                const rawDraft = generationAttempt.generation.value;
                attemptArtifacts.prompt = generationAttempt.prompt;
                attemptArtifacts.rawModelOutput = generationAttempt.generation.rawText;
                attemptArtifacts.parsedOutput = generationAttempt.generation.parsedJson;
                attemptArtifacts.rawDraft = rawDraft;
                attemptArtifacts.validationResult = {
                    ok: true,
                    errors: [],
                };
                attemptArtifacts.attemptMetadata = buildTopicAttemptMetadata({
                    seed,
                    generation: generationAttempt.generation,
                    retryAttempt: attempt,
                    maxRetries: MAX_TOPIC_RETRIES,
                });
                attemptArtifacts.hashes = buildTopicAttemptHashes({
                    seed,
                    prompt: generationAttempt.prompt,
                    rawModelOutput: generationAttempt.generation.rawText,
                    parsedOutput: generationAttempt.generation.parsedJson,
                });

                args.onProgress?.({
                    current: completedTopics,
                    total: totalTopics,
                    stage: "evaluating topic draft",
                    topicId: node.topic.topicId,
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                });

                const evaluation = await evaluateTopicDraft({
                    provider: args.provider,
                    seed,
                    rawDraft,
                    profileServices,
                    skipSemantic: validationState.semantic.skipped,
                });

                const draft = evaluation.draft;
                attemptArtifacts.normalizedDraft = evaluation.normalizedDraft;
                attemptArtifacts.repairedDraft = draft;
                attemptArtifacts.repairReport = evaluation.repairReport;
                attemptArtifacts.critiqueReport = evaluation.critiqueReport;
                attemptArtifacts.semanticReport = evaluation.semanticReport;
                attemptArtifacts.hashes = buildTopicAttemptHashes({
                    seed,
                    prompt: generationAttempt.prompt,
                    rawModelOutput: generationAttempt.generation.rawText,
                    parsedOutput: generationAttempt.generation.parsedJson,
                    normalizedDraft: evaluation.normalizedDraft,
                    repairedDraft: draft,
                });

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
                    retryable: true,
                });

                args.onProgress?.({
                    current: completedTopics,
                    total: totalTopics,
                    stage: "validating draft",
                    topicId: node.topic.topicId,
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                });

                try {
                    assertTopicAuthoringDraft(draft);
                } catch (error) {
                    throw new RetryableTopicValidationError({
                        code: "INVALID_TOPIC_AUTHORING_DRAFT",
                        message: error instanceof Error ? error.message : String(error),
                        details: { topicId: node.topic.topicId },
                    });
                }

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

                if (!validationState.qualityGates.skipped && !evaluation.critiqueReport.ok) {
                    const critiqueErrors = evaluation.critiqueReport.issues.filter(
                        (issue) => issue.severity === "error",
                    );

                    if (critiqueErrors.length) {
                        throwRetryableReportFailure({
                            code: "CRITIQUE_VALIDATION_FAILED",
                            title: "Critique failed",
                            topicId: node.topic.topicId,
                            moduleSlug: node.module.moduleSlug,
                            sectionSlug: node.section.sectionSlug,
                            reportDir,
                            messages: critiqueErrors.map((x) => x.message),
                            details: evaluation.critiqueReport,
                        });
                    }
                }

                if (!validationState.semantic.skipped && !evaluation.semanticReport.ok) {
                    const semanticErrors = evaluation.semanticReport.issues.filter(
                        (issue) => issue.severity === "error",
                    );

                    if (semanticErrors.length) {
                        throwRetryableReportFailure({
                            code: "SEMANTIC_VALIDATION_FAILED",
                            title: "Semantic validation failed",
                            topicId: node.topic.topicId,
                            moduleSlug: node.module.moduleSlug,
                            sectionSlug: node.section.sectionSlug,
                            reportDir,
                            messages: semanticErrors.map((x) => x.message),
                            details: evaluation.semanticReport,
                        });
                    }
                }

                args.onProgress?.({
                    current: completedTopics,
                    total: totalTopics,
                    stage: "building topic bundle",
                    topicId: node.topic.topicId,
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                });

                const topicBundle = buildTopicBundleFromDraft({
                    shape,
                    seed,
                    draft,
                });
                attemptArtifacts.topicBundle = topicBundle;
                attemptArtifacts.hashes = buildTopicAttemptHashes({
                    seed,
                    prompt: generationAttempt.prompt,
                    rawModelOutput: generationAttempt.generation.rawText,
                    parsedOutput: generationAttempt.generation.parsedJson,
                    normalizedDraft: evaluation.normalizedDraft,
                    repairedDraft: draft,
                    topicBundle,
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
                attemptArtifacts.qualityReport = qualityReport;

                const qualityFailures = qualityReport.issues.filter(
                    (issue) =>
                        issue.severity === "blocker" ||
                        issue.severity === "error",
                );

                if (!validationState.qualityGates.skipped && qualityFailures.length > 0) {
                    throwRetryableReportFailure({
                        code: "CURRICULUM_QUALITY_GATE_FAILED",
                        title: "Curriculum quality gate failed",
                        topicId: node.topic.topicId,
                        moduleSlug: node.module.moduleSlug,
                        sectionSlug: node.section.sectionSlug,
                        reportDir,
                        messages: qualityFailures.map((issue) => issue.message),
                        details: qualityReport,
                    });
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
                attemptArtifacts.goldenReport = goldenReport;

                if (!validationState.golden.skipped && !goldenReport.ok) {
                    const goldenErrors = goldenReport.issues.filter(
                        (issue) => issue.severity === "error",
                    );

                    if (goldenErrors.length) {
                        throwRetryableReportFailure({
                            code: "GOLDEN_VALIDATION_FAILED",
                            title: "Golden validation failed",
                            topicId: node.topic.topicId,
                            moduleSlug: node.module.moduleSlug,
                            sectionSlug: node.section.sectionSlug,
                            reportDir,
                            messages: goldenErrors.map((x) => x.message),
                            details: goldenReport,
                        });
                    }
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
                    args.onProgress?.({
                        current: completedTopics,
                        total: totalTopics,
                        stage: `translating topic messages (${locale})`,
                        topicId: node.topic.topicId,
                        moduleSlug: node.module.moduleSlug,
                        sectionSlug: node.section.sectionSlug,
                    });

                    messagesByLocale[locale] = await translateNonEmptyMessages({
                        provider: translationProvider,
                        shape,
                        sourceLocale,
                        locale,
                        sourceMessages,
                        label: `${args.blueprint.subjectSlug}/${node.topic.topicId} topic messages`,
                    });
                }

                args.onProgress?.({
                    current: completedTopics,
                    total: totalTopics,
                    stage: "writing topic artifacts",
                    topicId: node.topic.topicId,
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                });

                await writeTopicArtifacts({
                    subjectSlug: args.blueprint.subjectSlug,
                    moduleOrder: node.moduleIndex,
                    topicId: node.topic.topicId,
                    topicBundle,
                    messagesByLocale,
                });

                await writeTopicReports({
                    subjectSlug: args.blueprint.subjectSlug,
                    moduleOrder: node.moduleIndex,
                    topicId: node.topic.topicId,
                    rawDraft,
                    normalizedDraft: evaluation.normalizedDraft,
                    repairedDraft: draft,
                    hashes: attemptArtifacts.hashes,
                    repairReport: evaluation.repairReport,
                    critiqueReport: evaluation.critiqueReport,
                    semanticReport: evaluation.semanticReport,
                    goldenReport,
                    qualityReport: attemptArtifacts.qualityReport,
                    validationState,
                    topicBundle,
                });

                await writeTopicAttemptReport({
                    reportDir,
                    attempt,
                    status: "success",
                    ...attemptArtifacts,
                });

                await writeTopicCompileStatus({
                    reportDir,
                    status: "success",
                    attempts: attempt + 1,
                    finalAttempt: attempt,
                    validationState,
                });

                retrySummary.push({
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                    topicId: node.topic.topicId,
                    status: "success",
                    attempts: attempt + 1,
                    retryCodes,
                });
                completedTopics += 1;

                args.onProgress?.({
                    current: completedTopics,
                    total: totalTopics,
                    stage: attempt > 0 ? "completed topic after retry" : "completed topic",
                    topicId: node.topic.topicId,
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                });

                break;
            } catch (error) {
                previousError = error;
                retryCodes.push(errorCode(error));

                await writeTopicAttemptReport({
                    reportDir,
                    attempt,
                    status: "failed",
                    ...attemptArtifacts,
                    error,
                });

                const canRetry =
                    attempt < MAX_TOPIC_RETRIES &&
                    isRetryableTopicValidationError(error);

                if (canRetry) {
                    args.onProgress?.({
                        current: completedTopics,
                        total: totalTopics,
                        stage: `retryable topic failure (${attempt + 1}/${MAX_TOPIC_RETRIES})`,
                        topicId: node.topic.topicId,
                        moduleSlug: node.module.moduleSlug,
                        sectionSlug: node.section.sectionSlug,
                    });
                    continue;
                }

                await writeTopicCompileStatus({
                    reportDir,
                    status: "failed",
                    attempts: attempt + 1,
                    finalAttempt: attempt,
                    errorCode: errorCode(error),
                    errorMessage: errorMessage(error),
                    validationState,
                });

                retrySummary.push({
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                    topicId: node.topic.topicId,
                    status: "failed",
                    attempts: attempt + 1,
                    retryCodes,
                });

                await writeRetrySummary({
                    subjectSlug: args.blueprint.subjectSlug,
                    validationState,
                    topics: retrySummary,
                });

                if (isRetryableTopicValidationError(error)) {
                    throw new Error(
                        [
                            `Retryable topic generation failed after ${attempt + 1} attempt(s).`,
                            `Topic: ${node.module.moduleSlug}/${node.section.sectionSlug}/${node.topic.topicId}`,
                            `Last error code: ${error.code}`,
                            "",
                            error.message,
                            "",
                            `Report dir: ${reportDir}`,
                        ].join("\n"),
                    );
                }

                throw error;
            }
        }

        await writeRetrySummary({
            subjectSlug: args.blueprint.subjectSlug,
            validationState,
            topics: retrySummary,
        });
    }

    args.onProgress?.({
        current: totalTopics,
        total: totalTopics,
        stage: "done",
    });

    await writeRetrySummary({
        subjectSlug: args.blueprint.subjectSlug,
        validationState,
        topics: retrySummary,
    });

    await writeCourseQualityReport({
        subjectSlug: args.blueprint.subjectSlug,
        report: await buildCourseQualityReportFromArtifacts({
            blueprint: args.blueprint,
            plan: args.plan,
            spec: args.spec ?? null,
        }),
    });

    return {
        shape,
        subjectManifest,
    };
}
