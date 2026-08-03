import type { ReviewQuizSpec } from "@/lib/subjects/types";

export function getPracticeTopicRuntimeDefaults(
    spec: ReviewQuizSpec,
): ReviewQuizSpec["runtime"] {
    return spec.runtime ?? null;
}

export function resolveQuizPracticeRuntimeDefaults(args: {
    spec: ReviewQuizSpec;
    subjectRuntimeDefaults?: unknown;
    courseRuntimeDefaults?: unknown;
    moduleRuntimeDefaults?: unknown;
    sectionRuntimeDefaults?: unknown;
    topicRuntimeDefaults?: unknown;
}) {
    return {
        subjectRuntimeDefaults: args.subjectRuntimeDefaults ?? null,
        courseRuntimeDefaults: args.courseRuntimeDefaults ?? null,
        moduleRuntimeDefaults: args.moduleRuntimeDefaults ?? null,
        sectionRuntimeDefaults: args.sectionRuntimeDefaults ?? null,
        topicRuntimeDefaults:
            getPracticeTopicRuntimeDefaults(args.spec) ??
            args.topicRuntimeDefaults ??
            null,
    };
}
