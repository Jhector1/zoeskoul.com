import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import {
    generateTopicAuthoringDraft,
    translateMessages,
} from "@zoeskoul/curriculum-ai";
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
import { writeSubjectArtifacts } from "../write/writeSubjectArtifacts.js";
import { writeTopicArtifacts } from "../write/writeTopicArtifacts.js";
import { writeTopicReports } from "../reports/writeTopicReports.js";
import { evaluateTopicDraft } from "../quality/evaluateTopicDraft.js";
import type { CompileProgressCallback } from "./compileProgress.js";
import { resolvePlan } from "../spec/resolvePlan.js";
import { findTopicPlanNode } from "../plan/findTopicPlanNode.js";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";

export async function compileTopic(args: {
    blueprint: CourseBlueprint;
    provider: AiProvider;
    topicId: string;
    onProgress?: CompileProgressCallback;
}) {
    validateBlueprint(args.blueprint);

    const extraLocales = (args.blueprint.targetLocales ?? []).filter(
        (locale) => locale !== args.blueprint.sourceLocale,
    );
    const totalStages = 8 + extraLocales.length * 2;
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

    if (resolved.source === "spec") {
        advanceProgress({
            stage: "loaded course spec",
            topicId: args.topicId,
        });
    } else if (resolved.source === "saved_plan") {
        advanceProgress({
            stage: "loaded saved plan",
            topicId: args.topicId,
        });
    } else {
        advanceProgress({
            stage: "generated course plan",
            topicId: args.topicId,
        });
    }

    const node = findTopicPlanNode({
        plan: resolved.plan,
        topicId: args.topicId,
    });

    if (!node) {
        throw new Error(`Topic not found in resolved course structure: ${args.topicId}`);
    }

    const shape = getSubjectShape(args.blueprint.profileId as "sql" | "python");
    const profileServices = getProfileServices(args.blueprint.profileId);

    advanceProgress({
        stage: "building subject manifest",
        topicId: args.topicId,
    });

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

    const subjectMessagesByLocale: Record<string, Record<string, unknown>> = {
        [args.blueprint.sourceLocale]: sourceSubjectMessages,
    };

    for (const locale of extraLocales) {
        advanceProgress({
            stage: `translating subject messages (${locale})`,
            topicId: args.topicId,
        });

        subjectMessagesByLocale[locale] = await translateMessages(args.provider, {
            shape,
            sourceLocale: args.blueprint.sourceLocale,
            locale,
            sourceMessages: sourceSubjectMessages,
        });
    }

    advanceProgress({
        stage: "writing subject artifacts",
        topicId: args.topicId,
    });

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

    advanceProgress({
        stage: "generating topic draft",
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
    });

    const rawDraft = await generateTopicAuthoringDraft(args.provider, {
        seed,
        locale: args.blueprint.sourceLocale,
        shape,
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

    advanceProgress({
        stage: "validating draft",
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
    });

    assertTopicAuthoringDraft(draft);

    if (!evaluation.critiqueReport.ok) {
        const critiqueErrors = evaluation.critiqueReport.issues.filter(
            (issue) => issue.severity === "error",
        );
        if (critiqueErrors.length) {
            throw new Error(
                `Critique failed:\n${critiqueErrors.map((x) => `- ${x.message}`).join("\n")}`,
            );
        }
    }

    if (!evaluation.semanticReport.ok) {
        const semanticErrors = evaluation.semanticReport.issues.filter(
            (issue) => issue.severity === "error",
        );
        if (semanticErrors.length) {
            throw new Error(
                `Semantic validation failed:\n${semanticErrors
                    .map((x) => `- ${x.message}`)
                    .join("\n")}`,
            );
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
        moduleOrder: node.moduleIndex,
        sectionOrder: node.sectionOrder,
    });

    const sourceMessages = buildMessagesFromDraft({
        shape,
        seed,
        draft,
        moduleOrder: node.moduleIndex,
    });

    const messagesByLocale: Record<string, Record<string, unknown>> = {
        [args.blueprint.sourceLocale]: sourceMessages,
    };

    for (const locale of extraLocales) {
        advanceProgress({
            stage: `translating topic messages (${locale})`,
            topicId: node.topic.topicId,
            moduleSlug: node.module.moduleSlug,
            sectionSlug: node.section.sectionSlug,
        });

        messagesByLocale[locale] = await translateMessages(args.provider, {
            shape,
            sourceLocale: args.blueprint.sourceLocale,
            locale,
            sourceMessages,
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
        repairedDraft: draft,
        repairReport: evaluation.repairReport,
        critiqueReport: evaluation.critiqueReport,
        semanticReport: evaluation.semanticReport,
        topicBundle,
    });

    advanceProgress({
        stage: "completed topic",
        topicId: node.topic.topicId,
        moduleSlug: node.module.moduleSlug,
        sectionSlug: node.section.sectionSlug,
    });

    return {
        topicId: node.topic.topicId,
        subjectSlug: args.blueprint.subjectSlug,
    };
}