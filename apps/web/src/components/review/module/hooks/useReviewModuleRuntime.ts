import { useMemo } from "react";
import { toolsPolicyForSubject } from "@/lib/tools/policy";
import { resolveToolDefaults } from "@/components/tools/resolveToolDefaults";
import { resolveCourseSqlRunnerConfig } from "@/components/review/module/runtime/courseProfiles";
import type { ReviewModule } from "@/lib/subjects/types";
import {
    type LearningIdeConfig,
    mergeLearningIdeConfigs,
} from "@/lib/ide/learningIdeConfig";
import type { UnknownRecord } from "../runtime/reviewRuntimeTypes";

type Args = {
    subjectSlug: string;
    mod: ReviewModule;
    viewTopic: ReviewModule["topics"][number] | null;
};

type ReviewModuleWithMeta = ReviewModule & {
    meta?: UnknownRecord | null;
};

export function useReviewModuleRuntime({ subjectSlug, mod, viewTopic }: Args) {
    const { codeEnabled } = useMemo(() => {
        const meta = (mod as ReviewModuleWithMeta).meta;
        return toolsPolicyForSubject(subjectSlug, meta);
    }, [subjectSlug, mod]);

    const toolDefaults = useMemo(
        () =>
            resolveToolDefaults({
                subjectSlug,
                moduleMeta: (mod as ReviewModuleWithMeta).meta,
            }),
        [subjectSlug, mod],
    );

    const moduleRuntime =
        mod.runtimeDefaults ??
        ((mod as ReviewModuleWithMeta).meta?.runtimeDefaults as UnknownRecord | null | undefined) ??
        null;
    const moduleIdeConfig =
        mod.serviceDefaults ??
        ((mod as ReviewModuleWithMeta).meta?.serviceDefaults as LearningIdeConfig | null | undefined) ??
        null;

    const effectiveRuntime =
        ((viewTopic?.meta?.runtimeDefaults as UnknownRecord | null | undefined) ??
        moduleRuntime ??
        null);
    const effectiveRuntimeRecord = effectiveRuntime as UnknownRecord | null;
    const effectiveRuntimeLanguage =
        typeof effectiveRuntimeRecord?.language === "string"
            ? effectiveRuntimeRecord.language
            : undefined;
    const effectiveIdeConfig = mergeLearningIdeConfigs(
        moduleIdeConfig,
        (viewTopic?.meta?.serviceDefaults as LearningIdeConfig | null | undefined) ?? null,
    );

    const topicSqlFallback = useMemo(() => {
        const resolved = resolveCourseSqlRunnerConfig({
            subjectSlug,
            language: effectiveRuntimeLanguage,
            profileId: mod.profileId,
            versionFamily: mod.versionFamily,
            topicRuntimeDefaults: (viewTopic?.meta?.runtimeDefaults as UnknownRecord | null | undefined) ?? null,
            moduleRuntimeDefaults: moduleRuntime,
            runtimeDefaults: effectiveRuntime,
            defaultSqlDialect: toolDefaults.defaultSqlDialect,
        });

        if (!resolved.isSql || !resolved.sqlDatasetId) return null;
        return resolved;
    }, [subjectSlug, effectiveRuntimeLanguage, effectiveRuntime, viewTopic, moduleRuntime, toolDefaults.defaultSqlDialect, mod.profileId, mod.versionFamily]);

    return {
        codeEnabled,
        toolDefaults,
        moduleRuntime,
        moduleIdeConfig,
        effectiveRuntime,
        effectiveIdeConfig,
        topicSqlFallback,
    };
}
