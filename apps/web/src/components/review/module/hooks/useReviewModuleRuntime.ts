import { useMemo } from "react";
import { toolsPolicyForSubject } from "@/lib/tools/policy";
import { resolveToolDefaults } from "@/components/tools/resolveToolDefaults";
import { resolveCourseSqlRunnerConfig } from "@/components/review/module/runtime/courseProfiles";
import type { ReviewModule } from "@/lib/subjects/types";
import {
    type LearningIdeConfig,
    mergeLearningIdeConfigs,
} from "@/lib/ide/learningIdeConfig";

type Args = {
    subjectSlug: string;
    mod: ReviewModule;
    viewTopic: ReviewModule["topics"][number] | null;
};

export function useReviewModuleRuntime({ subjectSlug, mod, viewTopic }: Args) {
    const { codeEnabled } = useMemo(() => {
        const meta = (mod as any)?.meta;
        return toolsPolicyForSubject(subjectSlug, meta);
    }, [subjectSlug, mod]);

    const toolDefaults = useMemo(
        () =>
            resolveToolDefaults({
                subjectSlug,
                moduleMeta: (mod as any)?.meta,
            }),
        [subjectSlug, mod],
    );

    const moduleRuntime =
        (mod as any)?.runtimeDefaults ??
        (mod as any)?.meta?.runtimeDefaults ??
        null;
    const moduleIdeConfig =
        ((mod as any)?.serviceDefaults as LearningIdeConfig | null | undefined) ??
        ((mod as any)?.meta?.serviceDefaults as LearningIdeConfig | null | undefined) ??
        null;

    const effectiveRuntime =
        (viewTopic as any)?.meta?.runtimeDefaults ??
        moduleRuntime ??
        null;
    const effectiveIdeConfig = mergeLearningIdeConfigs(
        moduleIdeConfig,
        ((viewTopic as any)?.meta?.serviceDefaults as LearningIdeConfig | null | undefined) ?? null,
    );

    const topicSqlFallback = useMemo(() => {
        const resolved = resolveCourseSqlRunnerConfig({
            subjectSlug,
            language: effectiveRuntime?.language,
            topicRuntimeDefaults: (viewTopic as any)?.meta?.runtimeDefaults ?? null,
            moduleRuntimeDefaults: moduleRuntime,
            runtimeDefaults: effectiveRuntime,
            defaultSqlDialect: toolDefaults.defaultSqlDialect,
        });

        if (!resolved.isSql || !resolved.sqlDatasetId) return null;
        return resolved;
    }, [subjectSlug, effectiveRuntime, viewTopic, moduleRuntime, toolDefaults.defaultSqlDialect]);

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
