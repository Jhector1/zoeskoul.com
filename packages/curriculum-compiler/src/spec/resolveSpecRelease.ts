import type {
    CourseSpec,
    CourseSpecReleaseWindow,
} from "@zoeskoul/curriculum-contracts";

function applyWindow(spec: CourseSpec, window: CourseSpecReleaseWindow): CourseSpec {
    const filteredModules = spec.modules.filter(
        (module) =>
            module.moduleNumber >= window.startModuleNumber &&
            module.moduleNumber <= window.endModuleNumber,
    );

    const filteredModuleNumbers = new Set(filteredModules.map((m) => m.moduleNumber));

    const filteredModuleSummary =
        spec.courseOverview?.moduleSummary?.filter((entry) =>
            filteredModuleNumbers.has(entry.moduleNumber),
        ) ?? [];

    return {
        ...spec,
        courseOverview: spec.courseOverview
            ? {
                ...spec.courseOverview,
                moduleSummary: filteredModuleSummary,
            }
            : undefined,
        modules: filteredModules,
        releasePlan: {
            currentRelease: window,
            releases: [window],
        },
    };
}

export function resolveSpecRelease(spec: CourseSpec): CourseSpec {
    const current = spec.releasePlan?.currentRelease;
    if (!current) return spec;
    return applyWindow(spec, current);
}