import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";
import type { ReviewModulePageProps } from "../types";

export function resolveTopicStageRuntimeDefaults(args: {
    mod: ReviewModulePageProps["mod"];
    viewTopic: ReviewModulePageProps["mod"]["topics"][number] | null;
    routeSectionSlug?: string | null;
}) {
    const { mod, viewTopic, routeSectionSlug } = args;
    const resolvedSection =
        (Array.isArray(mod.sections) ? mod.sections : []).find((section) => {
            if (routeSectionSlug && section.slug === routeSectionSlug) {
                return true;
            }

            return Array.isArray(section.topics)
                ? section.topics.some((topic) => topic.id === viewTopic?.id)
                : false;
        }) ?? null;

    const topicAny = viewTopic as
        | (typeof viewTopic & {
              runtimeDefaults?: ManifestRuntimeDefaults | null;
          })
        | null;

    return {
        subjectRuntimeDefaults: null,
        courseRuntimeDefaults: null,
        moduleRuntimeDefaults: mod.runtimeDefaults ?? null,
        sectionRuntimeDefaults: resolvedSection?.runtimeDefaults ?? null,
        topicRuntimeDefaults:
            topicAny?.runtimeDefaults ??
            viewTopic?.meta?.runtimeDefaults ??
            null,
    };
}
