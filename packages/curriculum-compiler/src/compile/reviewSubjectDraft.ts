import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import path from "node:path";
import { validateBlueprint } from "../validate/validateBlueprint.js";
import { critiqueTopicDraft } from "./critiqueTopicDraft.js";
import { critiqueTopic } from "./critiqueTopic.js";
import type { CompileProgressCallback } from "./compileProgress.js";
import { resolvePlan } from "../spec/resolvePlan.js";
import { listTopicPlanNodes } from "../plan/listTopicPlanNodes.js";
import { readTopicReports } from "../reports/readTopicReports.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { getSubjectShape } from "@zoeskoul/curriculum-profiles";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { buildMessagesFromDraft } from "../emit/buildMessagesFromDraft.js";
import { writeTopicArtifacts } from "../write/writeTopicArtifacts.js";

function normalizeFilterValues(values?: string[]) {
    return (values ?? [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
}

function matchesModuleFilter(
    moduleFilters: string[],
    args: { moduleSlug: string; moduleIndex: number; moduleOrder: number },
) {
    if (moduleFilters.length < 1) return true;

    return moduleFilters.some((filter) => {
        return (
            filter === args.moduleSlug ||
            args.moduleSlug.startsWith(filter) ||
            filter === String(args.moduleIndex) ||
            filter === String(args.moduleOrder) ||
            filter === `module${args.moduleIndex}`
        );
    });
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function reportIssueCount(report: { issues?: unknown[] } | undefined) {
    return Array.isArray(report?.issues) ? report.issues.length : 0;
}

function repairCount(report: { repairs?: unknown[] } | undefined) {
    return Array.isArray(report?.repairs) ? report.repairs.length : 0;
}

function hasActionableTopicFixes(report: {
    repairReport?: { repairs?: unknown[] };
    critiqueReport?: { issues?: unknown[] };
    semanticReport?: { issues?: unknown[] };
    goldenReport?: { issues?: unknown[] };
}) {
    return (
        repairCount(report.repairReport) > 0 ||
        reportIssueCount(report.critiqueReport) > 0 ||
        reportIssueCount(report.semanticReport) > 0 ||
        reportIssueCount(report.goldenReport) > 0
    );
}

export async function reviewSubjectDraft(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
    moduleSlugs?: string[];
    topicIds?: string[];
    applyFixes?: boolean;
    onProgress?: CompileProgressCallback;
}) {
    validateBlueprint(args.blueprint);

    const moduleFilters = normalizeFilterValues(args.moduleSlugs);
    const topicFilters = normalizeFilterValues(args.topicIds);

    args.onProgress?.({
        current: 0,
        total: 0,
        stage: "resolving course structure",
    });

    const resolved = await resolvePlan({
        blueprint: args.blueprint,
        provider: args.provider,
    });

    const allTopicNodes = listTopicPlanNodes({
        plan: resolved.plan,
    });

    const topicNodes = allTopicNodes.filter((node) => {
        if (
            !matchesModuleFilter(moduleFilters, {
                moduleSlug: node.module.moduleSlug,
                moduleIndex: node.moduleIndex,
                moduleOrder: node.module.order,
            })
        ) {
            return false;
        }

        if (topicFilters.length > 0 && !topicFilters.includes(node.topic.topicId)) {
            return false;
        }

        return true;
    });

    if (topicNodes.length < 1) {
        const filterSummary = [
            moduleFilters.length > 0 ? `module=${moduleFilters.join(",")}` : null,
            topicFilters.length > 0 ? `topic=${topicFilters.join(",")}` : null,
        ]
            .filter(Boolean)
            .join(" ");

        throw new Error(
            filterSummary
                ? `No draft topics matched the requested filters (${filterSummary}).`
                : "No draft topics were found to review.",
        );
    }

    const totalTopics = topicNodes.length;
    const shape = getSubjectShape(args.blueprint.profileId as "sql" | "python");

    // `review-draft --fix` is intentionally patch-only: never delete or rebuild
    // the subject manifest/messages here. Those files preserve the existing draft
    // filenames plus the complete module/topic list. Topic-level fixes below only
    // update saved draft reports that already exist.

    if (resolved.source === "spec") {
        args.onProgress?.({
            current: 0,
            total: totalTopics,
            stage: "loaded course spec",
        });
    } else if (resolved.source === "saved_plan") {
        args.onProgress?.({
            current: 0,
            total: totalTopics,
            stage: "loaded saved plan",
        });
    } else {
        args.onProgress?.({
            current: 0,
            total: totalTopics,
            stage: "generated course plan",
        });
    }

    const results = [];
    let completedTopics = 0;
    let usedDraftCount = 0;
    let usedFreshCount = 0;
    let appliedFixCount = 0;
    let skippedMissingDraftCount = 0;

    for (const node of topicNodes) {
        args.onProgress?.({
            current: completedTopics,
            total: totalTopics,
            stage: "reviewing saved draft",
            moduleSlug: node.module.moduleSlug,
            sectionSlug: node.section.sectionSlug,
            topicId: node.topic.topicId,
        });

        const saved = await readTopicReports({
            subjectSlug: args.blueprint.subjectSlug,
            moduleOrder: node.moduleIndex,
            topicId: node.topic.topicId,
        });

        const hasSavedDraft = saved.rawDraft !== undefined || saved.repairedDraft !== undefined;

        let result;

        if (args.applyFixes && !hasSavedDraft) {
            skippedMissingDraftCount += 1;
            result = {
                mode: "draft" as const,
                subjectSlug: args.blueprint.subjectSlug,
                topicId: node.topic.topicId,
                moduleSlug: node.module.moduleSlug,
                sectionSlug: node.section.sectionSlug,
                moduleOrder: node.moduleIndex,
                reportDir: path.join(
                    ".curriculum-drafts",
                    "reports",
                    args.blueprint.subjectSlug,
                    `module${node.moduleIndex}`,
                    node.topic.topicId,
                ),
                repairReport: {
                    topicId: node.topic.topicId,
                    repairs: [],
                },
                critiqueReport: {
                    topicId: node.topic.topicId,
                    ok: true,
                    issues: [
                        {
                            code: "NO_SAVED_DRAFT_TO_FIX",
                            category: "other" as const,
                            severity: "warn" as const,
                            message:
                                "Skipped --fix because no saved raw-draft.json or repaired-draft.json report exists for this topic; review-draft --fix will not generate or rewrite a fresh topic.",
                        },
                    ],
                },
                semanticReport: {
                    topicId: node.topic.topicId,
                    ok: true,
                    issues: [],
                },
                goldenReport: {
                    topicId: node.topic.topicId,
                    ok: true,
                    issues: [],
                },
            };
        } else {
            try {
                result = hasSavedDraft
                    ? await critiqueTopicDraft({
                        blueprint: args.blueprint,
                        provider: args.provider,
                        topicId: node.topic.topicId,
                    })
                    : await critiqueTopic({
                        blueprint: args.blueprint,
                        provider: args.provider,
                        topicId: node.topic.topicId,
                    });
            } catch (error) {
                result = {
                    mode: hasSavedDraft ? ("draft" as const) : ("fresh" as const),
                    subjectSlug: args.blueprint.subjectSlug,
                    topicId: node.topic.topicId,
                    moduleSlug: node.module.moduleSlug,
                    sectionSlug: node.section.sectionSlug,
                    moduleOrder: node.moduleIndex,
                    reportDir: path.join(
                        ".curriculum-drafts",
                        "reports",
                        args.blueprint.subjectSlug,
                        `module${node.moduleIndex}`,
                        node.topic.topicId,
                    ),
                    repairReport: {
                        topicId: node.topic.topicId,
                        repairs: [],
                    },
                    critiqueReport: {
                        topicId: node.topic.topicId,
                        ok: false,
                        issues: [
                            {
                                code: "REVIEW_TOPIC_FAILED",
                                category: "other" as const,
                                severity: "error" as const,
                                message: errorMessage(error),
                            },
                        ],
                    },
                    semanticReport: {
                        topicId: node.topic.topicId,
                        ok: true,
                        issues: [],
                    },
                    goldenReport: {
                        topicId: node.topic.topicId,
                        ok: true,
                        issues: [],
                    },
                };
            }
        }

        if (hasSavedDraft) usedDraftCount += 1;
        else if (!args.applyFixes) usedFreshCount += 1;

        if (args.applyFixes && hasSavedDraft) {
            const refreshed = await readTopicReports({
                subjectSlug: args.blueprint.subjectSlug,
                moduleOrder: node.moduleIndex,
                topicId: node.topic.topicId,
            });

            if (
                refreshed.repairedDraft !== undefined &&
                hasActionableTopicFixes(refreshed)
            ) {
                const seed = buildTopicSeedFromPlanNode({
                    blueprint: args.blueprint,
                    spec: resolved.spec,
                    module: node.module,
                    section: node.section,
                    topic: node.topic,
                });
                const repairedDraft = refreshed.repairedDraft as any;
                const topicBundle = buildTopicBundleFromDraft({
                    shape,
                    seed,
                    draft: repairedDraft,
                    moduleOrder: node.moduleIndex,
                    sectionOrder: node.sectionOrder,
                });
                const messagesByLocale = {
                    [args.blueprint.sourceLocale]: buildMessagesFromDraft({
                        shape,
                        seed,
                        draft: repairedDraft,
                        moduleOrder: node.moduleIndex,
                    }),
                };

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
                    rawDraft: refreshed.rawDraft,
                    repairedDraft: refreshed.repairedDraft,
                    repairReport: refreshed.repairReport,
                    critiqueReport: refreshed.critiqueReport,
                    semanticReport: refreshed.semanticReport,
                    goldenReport: refreshed.goldenReport,
                    topicBundle,
                });
                appliedFixCount += 1;
            }
        }

        results.push(result);
        completedTopics += 1;

        args.onProgress?.({
            current: completedTopics,
            total: totalTopics,
            stage: "completed saved draft review",
            moduleSlug: node.module.moduleSlug,
            sectionSlug: node.section.sectionSlug,
            topicId: node.topic.topicId,
        });
    }

    args.onProgress?.({
        current: totalTopics,
        total: totalTopics,
        stage: "done",
    });

    return {
        mode:
            usedDraftCount > 0 && usedFreshCount > 0
                ? ("mixed" as const)
                : usedFreshCount > 0
                    ? ("fresh" as const)
                    : ("draft" as const),
        subjectSlug: args.blueprint.subjectSlug,
        moduleFilters,
        topicFilters,
        usedDraftCount,
        usedFreshCount,
        appliedFixCount,
        skippedMissingDraftCount,
        topics: results,
    };
}
