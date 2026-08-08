export function buildQuizBlockRuntimeDefaultsProps(args: {
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
        topicRuntimeDefaults: args.topicRuntimeDefaults ?? null,
    };
}
