import { useMemo } from "react";
import { toolsPolicyForSubject } from "@/lib/tools/policy";
import { resolveToolDefaults } from "@/components/tools/resolveToolDefaults";
import { resolveSqlRunnerConfig } from "@/lib/subjects/sql/runtime/resolveSqlRunnerConfig";
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
        if (effectiveRuntime?.kind !== "sql" || !effectiveRuntime.datasetId) return null;

        return resolveSqlRunnerConfig({
            language: "sql",
            sqlDialect: effectiveRuntime.fixedSqlDialect,
            sqlDatasetId: effectiveRuntime.datasetId,
            defaultSqlDialect: toolDefaults.defaultSqlDialect,
        });
    }, [effectiveRuntime, toolDefaults.defaultSqlDialect]);

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
