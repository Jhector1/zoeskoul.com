import { useMemo } from "react";
import { toolsPolicyForSubject } from "@/lib/tools/policy";
import { resolveToolDefaults } from "@/components/tools/resolveToolDefaults";
import { resolveCourseSqlRunnerConfig } from "@/components/review/module/runtime/courseProfiles";
import type { ReviewModule } from "@/lib/subjects/types";
import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";
import {
    learningIdeFromRuntimeDefaults,
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

export function resolveReviewModuleToolDefaults(args: {
    subjectSlug: string;
    mod: ReviewModule;
    viewTopic: ReviewModule["topics"][number] | null;
}){
    const moduleRuntime =
        args.mod.runtimeDefaults ??
        ((args.mod as ReviewModuleWithMeta).meta?.runtimeDefaults as UnknownRecord | null | undefined) ??
        null;
    const effectiveRuntime =
        ((args.viewTopic?.meta?.runtimeDefaults as UnknownRecord | null | undefined) ??
            moduleRuntime ??
            null);
    const effectiveRuntimeRecord = effectiveRuntime as UnknownRecord | null;
    const effectiveRuntimeLanguage =
        typeof effectiveRuntimeRecord?.language === "string"
            ? effectiveRuntimeRecord.language
            : undefined;

    return resolveToolDefaults({
        subjectSlug: args.subjectSlug,
        moduleMeta: (args.mod as ReviewModuleWithMeta).meta,
        profileId: args.mod.profileId,
        versionFamily: args.mod.versionFamily,
        runtimeDefaults: effectiveRuntime ?? moduleRuntime,
        language: effectiveRuntimeLanguage,
    });
}

export function useReviewModuleRuntime({ subjectSlug, mod, viewTopic }: Args) {
    const { codeEnabled } = useMemo(() => {
        const meta = (mod as ReviewModuleWithMeta).meta;
        return toolsPolicyForSubject(subjectSlug, meta, mod.profileId);
    }, [subjectSlug, mod]);

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
        learningIdeFromRuntimeDefaults(moduleRuntime as ManifestRuntimeDefaults | null),
        moduleIdeConfig,
        learningIdeFromRuntimeDefaults(effectiveRuntime as ManifestRuntimeDefaults | null),
        (viewTopic?.meta?.serviceDefaults as LearningIdeConfig | null | undefined) ?? null,
    );

    const toolDefaults = useMemo(
        () =>
            resolveReviewModuleToolDefaults({
                subjectSlug,
                mod,
                viewTopic,
            }),
        [
            subjectSlug,
            mod,
            viewTopic,
        ],
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
