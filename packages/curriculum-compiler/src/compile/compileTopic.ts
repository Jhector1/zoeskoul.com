// packages/curriculum-compiler/src/compile/compileTopic.ts

import path from "node:path";
import type { CourseBlueprint, TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import type { AiProvider, TopicRetryContext } from "@zoeskoul/curriculum-ai";
import { generateTopicAuthoringDraftAttempt } from "@zoeskoul/curriculum-ai";
import { getDraftReportsRoot } from "@zoeskoul/curriculum-core";
import {
    getProfileServices,
    getSubjectShape,
} from "@zoeskoul/curriculum-profiles";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { assertTopicAuthoringDraft } from "../validate/assertTopicAuthoringDraft.js";
import { buildSubjectManifestFromPlan } from "../emit/buildSubjectManifestFromPlan.js";
import { buildSubjectMessagesFromPlan } from "../emit/buildSubjectMessagesFromPlan.js";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { buildMessagesFromDraft } from "../emit/buildMessagesFromDraft.js";
import {
    assertNonEmptyMessages,
    translateNonEmptyMessages,
} from "../emit/translateNonEmptyMessages.js";
import { writeSubjectArtifacts } from "../write/writeSubjectArtifacts.js";
import { writeTopicArtifacts } from "../write/writeTopicArtifacts.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { writeTopicAttemptReport } from "../reports/writeTopicAttemptReport.js";
import { writeTopicCompileStatus } from "../reports/writeTopicCompileStatus.js";
import {
    buildTopicAttemptHashes,
    buildTopicAttemptMetadata,
    extractGenerationDiagnostics,
} from "../reports/topicGenerationAudit.js";
import { evaluateTopicDraft } from "../quality/evaluateTopicDraft.js";
import { buildCurriculumQualityReport } from "../quality/buildCurriculumQualityReport.js";
import type { CurriculumQualityReport } from "../quality/buildCurriculumQualityReport.js";
import type { CompileProgressCallback } from "./compileProgress.js";
import { extractRetryIssues } from "./topicRetryContext.js";
import { resolvePlan } from "../spec/resolvePlan.js";
import { findTopicPlanNode } from "../plan/findTopicPlanNode.js";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";
import { resolveWorkspacePolicy } from "../policy/resolveWorkspacePolicy.js";
import { validateWorkspacePolicy } from "../validate/validateWorkspacePolicy.js";
import { validateTopicBundleIdentity } from "../validate/validateTopicBundleIdentity.js";
import { validateTopicMessagesIdentity } from "../validate/validateTopicMessagesIdentity.js";
import { validateGenericExerciseHelp } from "../validate/validateGenericExerciseHelp.js";
import { validateStarterCodeDoesNotRevealSolution } from "../validate/validateStarterCodeDoesNotRevealSolution.js";
import { validateNoDummyFillBlankQuestions } from "../validate/validateNoDummyFillBlankQuestions.js";
import {
    isRetryableTopicValidationError,
    RetryableTopicValidationError,
} from "../validate/RetryableTopicValidationError.js";

const MAX_TOPIC_RETRIES = 2;

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

function errorCode(error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error) {
        return String((error as any).code ?? "UNKNOWN");
    }

    return "UNKNOWN";
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
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

export async function compileTopic(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
    translationProvider?: AiProvider;
    topicId: string;
    onProgress?: CompileProgressCallback;
}) {
    validateBlueprint(args.blueprint);

    const translationProvider = args.translationProvider ?? args.provider;
    const sourceLocale = args.blueprint.sourceLocale;
    const extraLocales = (args.blueprint.targetLocales ?? []).filter(
        (locale) => locale !== sourceLocale,
    );

    const totalStages = 8 + extraLocales.length * 2 + MAX_TOPIC_RETRIES;
    let currentStage = 0;

    function advanceProgress(info: {
        stage: string;
        moduleSlug?: string;
        sectionSlug?: string;
        topicId?: string;
    }) {
        currentStage += 1;
        args.onProgress?.({
            current: Math.min(currentStage, totalStages),
            total: totalStages,
            stage: info.stage,
            moduleSlug: info.moduleSlug,
            sectionSlug: info.sectionSlug,
            topicId: info.topicId ?? args.topicId,
        });
    }

    args.onProgress?.({
        current: 0,
        total: totalStages,
        stage: "starting",
        topicId: args.topicId,
    });

    const resolved = await resolvePlan({
        blueprint: args.blueprint,
        provider: args.provider,
    });

    advanceProgress({
        stage:
            resolved.source === "spec"
                ? "loaded course spec"
                : resolved.source === "saved_plan"
                  ? "loaded saved plan"
                  : "generated course plan",
        topicId: args.topicId,
    });

    const node = findTopicPlanNode({
        plan: resolved.plan,
        topicId: args.topicId,
    });

    if (!node) {
        throw new Error(`Topic not found in resolved course structure: ${args.topicId}`);
    }

    const shape = getSubjectShape(args.blueprint.profileId);
    const profileServices = getProfileServices(args.blueprint.profileId);

    advanceProgress({ stage: "building subject manifest", topicId: args.topicId });

    const subjectManifest = buildSubjectManifestFromPlan({
        blueprint: args.blueprint,
        plan: resolved.plan,
        shape,
    });

    const sourceSubjectMessages = buildSubjectMessagesFromPlan({
        blueprint: args.blueprint,
        plan: resolved.plan,
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
        advanceProgress({ stage: `translating subject messages (${locale})`, topicId: args.topicId });

        subjectMessagesByLocale[locale] = await translateNonEmptyMessages({
            provider: translationProvider,
            shape,
            sourceLocale,
            locale,
            sourceMessages: sourceSubjectMessages,
            label: `${args.blueprint.subjectSlug} subject messages`,
        });
    }

    advanceProgress({ stage: "writing subject artifacts", topicId: args.topicId });

    await writeSubjectArtifacts({
        subjectSlug: args.blueprint.subjectSlug,
        subjectManifest,
        subjectMessagesByLocale,
    });

    const seed = buildTopicSeedFromPlanNode({
        blueprint: args.blueprint,
        spec: resolved.spec,
        module: node.module,
        section: node.section,
        topic: node.topic,
    });

    const reportDir = getTopicReportDir({
        subjectSlug: args.blueprint.subjectSlug,
        moduleOrder: node.moduleIndex,
        topicId: node.topic.topicId,
    });

    let previousError: unknown = null;

    for (let attempt = 0; attempt <= MAX_TOPIC_RETRIES; attempt += 1) {
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
            topicBundle?: unknown;
        } = {};

        try {
            advanceProgress({
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

            advanceProgress({
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

            advanceProgress({
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
                location: `${seed.moduleSlug}/${seed.sectionSlug}/${seed.topicId}`,
            });
            validateNoDummyFillBlankQuestions({
                draft,
                location: `${seed.moduleSlug}/${seed.sectionSlug}/${seed.topicId}`,
            });

            if (!evaluation.critiqueReport.ok) {
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
                        details: {
                            ...evaluation.critiqueReport,
                            repairs: evaluation.repairReport.repairs,
                        },
                    });
                }
            }

            if (!evaluation.semanticReport.ok) {
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

            advanceProgress({
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
                    issue.severity === "blocker" || issue.severity === "error",
            );

            if (qualityFailures.length > 0) {
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

            const goldenReport = await profileServices.validateGolden({
                seed,
                draft,
                topicBundle,
            });
            attemptArtifacts.goldenReport = goldenReport;

            if (!goldenReport.ok) {
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
                advanceProgress({
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

            advanceProgress({
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
            });

            advanceProgress({
                stage: attempt > 0 ? "completed topic after retry" : "completed topic",
                topicId: node.topic.topicId,
                moduleSlug: node.module.moduleSlug,
                sectionSlug: node.section.sectionSlug,
            });

            return {
                topicId: node.topic.topicId,
                subjectSlug: args.blueprint.subjectSlug,
            };
        } catch (error) {
            previousError = error;

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
                advanceProgress({
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

    throw previousError;
}
