import type {
    CourseSpec,
    CourseSpecModule,
    CourseSpecSection,
    CourseSpecReleaseWindow,
    ExerciseKindMix,
} from "@zoeskoul/curriculum-contracts";
import {
    getCurriculumProfile,
    validateProfileShapeConsistency,
} from "@zoeskoul/curriculum-profiles";

function isNonEmptyString(value: unknown) {
    return typeof value === "string" && value.trim().length > 0;
}

function effectiveDatasetStrategy(spec: CourseSpec, module: CourseSpecModule) {
    return module.runtimePolicy?.datasetStrategy ?? spec.policy?.runtimePolicy?.datasetStrategy;
}

function validateMix(
    mix: ExerciseKindMix | undefined,
    path: string,
    issues: string[],
) {
    if (!mix) return;

    const values = Object.entries(mix);
    if (!values.length) {
        issues.push(`${path}: exercise mix must not be empty`);
        return;
    }

    let total = 0;

    for (const [key, value] of values) {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            issues.push(`${path}: ${key} must be a non-negative number`);
            continue;
        }

        total += value;
    }

    if (total <= 0) {
        issues.push(`${path}: exercise mix total must be greater than 0`);
    }
}

function validateReleaseWindow(
    window: CourseSpecReleaseWindow | undefined,
    spec: CourseSpec,
    path: string,
    issues: string[],
) {
    if (!window) return;

    if (!isNonEmptyString(window.name)) {
        issues.push(`${path}.name is required`);
    }

    if (
        typeof window.startModuleNumber !== "number" ||
        !Number.isFinite(window.startModuleNumber)
    ) {
        issues.push(`${path}.startModuleNumber must be a number`);
        return;
    }

    if (
        typeof window.endModuleNumber !== "number" ||
        !Number.isFinite(window.endModuleNumber)
    ) {
        issues.push(`${path}.endModuleNumber must be a number`);
        return;
    }

    if (window.startModuleNumber > window.endModuleNumber) {
        issues.push(`${path}: startModuleNumber must be <= endModuleNumber`);
    }

    const moduleNumbers = new Set(spec.modules.map((module) => module.moduleNumber));

    for (let i = window.startModuleNumber; i <= window.endModuleNumber; i += 1) {
        if (!moduleNumbers.has(i)) {
            issues.push(`${path}: moduleNumber ${i} is not present in spec.modules`);
        }
    }
}

function validateSection(
    section: CourseSpecSection,
    module: CourseSpecModule,
    path: string,
    sectionSlugSet: Set<string>,
    topicIdSet: Set<string>,
    allowBlankTopicIds: boolean,
    allowDuplicateTopicIds: boolean,
    issues: string[],
) {
    if (!isNonEmptyString(section.sectionSlug)) {
        issues.push(`${path}.sectionSlug is required`);
    } else if (sectionSlugSet.has(section.sectionSlug)) {
        issues.push(`${path}: duplicate sectionSlug "${section.sectionSlug}"`);
    } else {
        sectionSlugSet.add(section.sectionSlug);
    }

    if (!isNonEmptyString(section.title)) {
        issues.push(`${path}.title is required`);
    }

    if (section.description != null && !String(section.description).trim()) {
        issues.push(`${path}.description must not be blank if provided`);
    }

    if (
        section.role != null &&
        section.role !== "lesson" &&
        section.role !== "module_project" &&
        section.role !== "capstone"
    ) {
        issues.push(`${path}.role must be "lesson", "module_project", or "capstone" when provided`);
    }

    if (section.weeksLabel != null && !String(section.weeksLabel).trim()) {
        issues.push(`${path}.weeksLabel must not be blank if provided`);
    }

    if (
        section.weekStart != null &&
        (typeof section.weekStart !== "number" || !Number.isFinite(section.weekStart))
    ) {
        issues.push(`${path}.weekStart must be a number when provided`);
    }

    if (
        section.weekEnd != null &&
        (typeof section.weekEnd !== "number" || !Number.isFinite(section.weekEnd))
    ) {
        issues.push(`${path}.weekEnd must be a number when provided`);
    }

    if (
        typeof section.weekStart === "number" &&
        typeof section.weekEnd === "number" &&
        section.weekStart > section.weekEnd
    ) {
        issues.push(`${path}.weekStart cannot be greater than weekEnd`);
    }

    if (section.bullets != null) {
        if (!Array.isArray(section.bullets)) {
            issues.push(`${path}.bullets must be an array when provided`);
        } else {
            section.bullets.forEach((bullet, index) => {
                if (!isNonEmptyString(bullet)) {
                    issues.push(`${path}.bullets[${index}] must not be blank`);
                }
            });
        }
    }

    if (!Array.isArray(section.topics) || !section.topics.length) {
        issues.push(`${path}.topics must be a non-empty array`);
        return;
    }

    for (const [topicIndex, topic] of section.topics.entries()) {
        const topicPath = `${path}.topics[${topicIndex}]`;

        if (!allowBlankTopicIds && !isNonEmptyString(topic.topicId)) {
            issues.push(`${topicPath}.topicId is required for "${topic.title}"`);
        }

        if (isNonEmptyString(topic.topicId)) {
            if (!allowDuplicateTopicIds && topicIdSet.has(topic.topicId)) {
                issues.push(`${topicPath}: duplicate topicId "${topic.topicId}"`);
            } else {
                topicIdSet.add(topic.topicId);
            }
        }

        if (!isNonEmptyString(topic.title)) {
            issues.push(`${topicPath}.title is required`);
        }

        if (
            topic.minutes != null &&
            (typeof topic.minutes !== "number" ||
                !Number.isFinite(topic.minutes) ||
                topic.minutes <= 0)
        ) {
            issues.push(`${topicPath}.minutes must be a positive number`);
        }

        if (topic.practice != null) {
            if (!topic.practice || typeof topic.practice !== "object") {
                issues.push(`${topicPath}.practice must be an object when provided`);
            } else {
                if (
                    typeof topic.practice.tryIt !== "undefined" &&
                    typeof topic.practice.tryIt !== "boolean"
                ) {
                    issues.push(`${topicPath}.practice.tryIt must be a boolean when provided`);
                }
                if (
                    typeof topic.practice.requiresTryIt !== "undefined" &&
                    typeof topic.practice.requiresTryIt !== "boolean"
                ) {
                    issues.push(`${topicPath}.practice.requiresTryIt must be a boolean when provided`);
                }
                if (
                    typeof topic.practice.conceptualOnly !== "undefined" &&
                    typeof topic.practice.conceptualOnly !== "boolean"
                ) {
                    issues.push(`${topicPath}.practice.conceptualOnly must be a boolean when provided`);
                }

                if (
                    typeof topic.practice.tryItExerciseId !== "undefined" &&
                    !isNonEmptyString(topic.practice.tryItExerciseId)
                ) {
                    issues.push(`${topicPath}.practice.tryItExerciseId must be non-empty when provided`);
                }

                if (
                    typeof topic.practice.tryItPlacement !== "undefined" &&
                    topic.practice.tryItPlacement !== "first_sketch" &&
                    topic.practice.tryItPlacement !== "all_sketches" &&
                    topic.practice.tryItPlacement !== "none"
                ) {
                    issues.push(`${topicPath}.practice.tryItPlacement must be "first_sketch", "all_sketches", or "none" when provided`);
                }

                if (
                    typeof topic.practice.tryItExerciseIds !== "undefined" &&
                    (!Array.isArray(topic.practice.tryItExerciseIds) ||
                        topic.practice.tryItExerciseIds.some((value) => !isNonEmptyString(value)))
                ) {
                    issues.push(`${topicPath}.practice.tryItExerciseIds must be an array of non-empty strings when provided`);
                }

                if (
                    typeof topic.practice.tryItSketchIndex !== "undefined" &&
                    (
                        typeof topic.practice.tryItSketchIndex !== "number" ||
                        !Number.isFinite(topic.practice.tryItSketchIndex) ||
                        topic.practice.tryItSketchIndex < 0
                    )
                ) {
                    issues.push(`${topicPath}.practice.tryItSketchIndex must be a non-negative number when provided`);
                }
                if (
                    typeof topic.practice.runtimeMode !== "undefined" &&
                    topic.practice.runtimeMode !== "terminal_workspace" &&
                    topic.practice.runtimeMode !== "editor_workspace" &&
                    topic.practice.runtimeMode !== "sql_workspace"
                ) {
                    issues.push(`${topicPath}.practice.runtimeMode must be "terminal_workspace", "editor_workspace", or "sql_workspace" when provided`);
                }
                if (
                    typeof topic.practice.expectedPracticeKinds !== "undefined" &&
                    (!Array.isArray(topic.practice.expectedPracticeKinds) ||
                        topic.practice.expectedPracticeKinds.some((value) => !isNonEmptyString(value)))
                ) {
                    issues.push(`${topicPath}.practice.expectedPracticeKinds must be an array of non-empty strings when provided`);
                }
                if (
                    typeof topic.practice.terminalSessionScope !== "undefined" &&
                    topic.practice.terminalSessionScope !== "exercise" &&
                    topic.practice.terminalSessionScope !== "topic" &&
                    topic.practice.terminalSessionScope !== "project"
                ) {
                    issues.push(`${topicPath}.practice.terminalSessionScope must be "exercise", "topic", or "project" when provided`);
                }

                if (
                    typeof topic.practice.projectFlow !== "undefined" &&
                    topic.practice.projectFlow !== "standalone" &&
                    topic.practice.projectFlow !== "progressive"
                ) {
                    issues.push(`${topicPath}.practice.projectFlow must be "standalone" or "progressive" when provided`);
                }
            }
        }
    }
}

export function validateCourseSpec(spec: CourseSpec): string[] {
    const issues: string[] = [];
    const profile = getCurriculumProfile(spec.profileId);
    issues.push(...validateProfileShapeConsistency(profile));

    if (!isNonEmptyString(spec.authoringFormatVersion)) {
        issues.push("authoringFormatVersion is required");
    }

    if (!isNonEmptyString(spec.subjectSlug)) {
        issues.push("subjectSlug is required");
    }

    if (!isNonEmptyString(spec.courseSlug)) {
        issues.push("courseSlug is required");
    }

    if (!isNonEmptyString(spec.catalogSlug)) {
        issues.push("catalogSlug is required");
    }

    if (!isNonEmptyString(spec.profileId)) {
        issues.push("profileId is required");
    }

    if (!isNonEmptyString(spec.title)) {
        issues.push("title is required");
    }
    if (
        !isNonEmptyString((spec as any).description) &&
        !isNonEmptyString(spec.courseOverview?.summary)
    ) {
        issues.push("description or courseOverview.summary is required");
    }
    if (!isNonEmptyString(spec.sourceLocale)) {
        issues.push("sourceLocale is required");
    }

    if (!Array.isArray(spec.targetLocales)) {
        issues.push("targetLocales must be an array");
    }

    if (!Array.isArray(spec.modules) || !spec.modules.length) {
        issues.push("modules must be a non-empty array");
        return issues;
    }

    validateMix(
        spec.policy?.exercisePolicy?.defaultMix,
        "policy.exercisePolicy.defaultMix",
        issues,
    );

    validateReleaseWindow(
        spec.releasePlan?.currentRelease,
        spec,
        "releasePlan.currentRelease",
        issues,
    );

    if (Array.isArray(spec.releasePlan?.releases)) {
        spec.releasePlan.releases.forEach((release, index) => {
            validateReleaseWindow(
                release,
                spec,
                `releasePlan.releases[${index}]`,
                issues,
            );
        });
    }

    const allowBlankTopicIds = spec.policy?.qualityPolicy?.allowBlankTopicIds === true;
    const allowDuplicateTopicIds =
        spec.policy?.qualityPolicy?.allowDuplicateTopicIds === true;
    const requireUniqueModuleSlugs =
        spec.policy?.qualityPolicy?.requireUniqueModuleSlugs !== false;
    const requireUniqueSectionSlugs =
        spec.policy?.qualityPolicy?.requireUniqueSectionSlugs !== false;
    const requireModuleProject =
        spec.policy?.qualityPolicy?.requireModuleProject === true;
    const maxModuleProjectLength =
        spec.policy?.qualityPolicy?.maxModuleProjectLength ?? 320;
    const minProjectsBeforeCapstone =
        spec.policy?.projectPolicy?.minProjectsBeforeCapstone ?? 0;
    const capstoneRequired =
        spec.policy?.projectPolicy?.capstoneRequired === true;
    const enforceAuthoredProjectStructure =
        capstoneRequired || minProjectsBeforeCapstone > 0;

    const moduleSlugSet = new Set<string>();
    const sectionSlugSet = new Set<string>();
    const topicIdSet = new Set<string>();
    const moduleStructure = spec.modules.map((module, moduleIndex) => ({
        moduleIndex,
        modulePath: `modules[${moduleIndex}]`,
        isCapstoneModule: module.role === "capstone",
        moduleProjectSectionCount: module.sections.filter(
            (section) => section.role === "module_project",
        ).length,
        capstoneSectionCount: module.sections.filter(
            (section) => section.role === "capstone",
        ).length,
    }));

    spec.modules.forEach((module, moduleIndex) => {
        const modulePath = `modules[${moduleIndex}]`;

        if (!isNonEmptyString(module.moduleSlug)) {
            issues.push(`${modulePath}.moduleSlug is required`);
        } else if (requireUniqueModuleSlugs && moduleSlugSet.has(module.moduleSlug)) {
            issues.push(`${modulePath}: duplicate moduleSlug "${module.moduleSlug}"`);
        } else {
            moduleSlugSet.add(module.moduleSlug);
        }

        if (typeof module.moduleNumber !== "number" || !Number.isFinite(module.moduleNumber)) {
            issues.push(`${modulePath}.moduleNumber is required`);
        }

        if (!isNonEmptyString(module.title)) {
            issues.push(`${modulePath}.title is required`);
        }

        if (
            module.role != null &&
            module.role !== "standard" &&
            module.role !== "capstone"
        ) {
            issues.push(`${modulePath}.role must be "standard" or "capstone" when provided`);
        }

        if (!Array.isArray(module.sections) || !module.sections.length) {
            issues.push(`${modulePath}.sections must be a non-empty array`);
            return;
        }

        if (requireModuleProject && !isNonEmptyString(module.moduleProject)) {
            issues.push(`${modulePath}.moduleProject is required`);
        }

        if (
            isNonEmptyString(module.moduleProject) &&
            String(module.moduleProject).length > maxModuleProjectLength
        ) {
            issues.push(
                `${modulePath}.moduleProject is too long and likely contains overloaded notes`,
            );
        }

        validateMix(
            module.exercisePolicy?.mix,
            `${modulePath}.exercisePolicy.mix`,
            issues,
        );

        if (module.sectionCount != null && module.sectionCount !== module.sections.length) {
            issues.push(
                `${modulePath}: sectionCount=${module.sectionCount} but actual sections=${module.sections.length}`,
            );
        }

        const actualTopicCount = module.sections.reduce(
            (sum, section) => sum + section.topics.length,
            0,
        );

        if (module.topicCount != null && module.topicCount !== actualTopicCount) {
            issues.push(
                `${modulePath}: topicCount=${module.topicCount} but actual topics=${actualTopicCount}`,
            );
        }

        if (
            profile.runtimeKind === "sql" &&
            effectiveDatasetStrategy(spec, module) === "module_based" &&
            !isNonEmptyString(module.runtimePolicy?.datasetId)
        ) {
            issues.push(
                `${modulePath}.runtimePolicy.datasetId is required when datasetStrategy="module_based" for profile "${spec.profileId}"`,
            );
        }

        for (const [sectionIndex, section] of module.sections.entries()) {
            validateSection(
                section,
                module,
                `${modulePath}.sections[${sectionIndex}]`,
                requireUniqueSectionSlugs ? sectionSlugSet : new Set<string>(),
                topicIdSet,
                allowBlankTopicIds,
                allowDuplicateTopicIds,
                issues,
            );
        }

        const moduleProjectSections = module.sections.filter(
            (section) => section.role === "module_project",
        );
        const capstoneSections = module.sections.filter(
            (section) => section.role === "capstone",
        );

        if (moduleProjectSections.length > 1) {
            issues.push(`${modulePath}: only one module_project section is allowed`);
        }

        if (capstoneSections.length > 1) {
            issues.push(`${modulePath}: only one capstone section is allowed`);
        }

        if (moduleProjectSections.length > 0 && capstoneSections.length > 0) {
            issues.push(`${modulePath}: cannot mix module_project and capstone sections`);
        }

        if (module.role === "capstone" && capstoneSections.length === 0) {
            issues.push(
                `${modulePath}: capstone modules must include a capstone section`,
            );
        }

        if (module.role !== "capstone" && capstoneSections.length > 0) {
            issues.push(
                `${modulePath}: capstone sections require module.role="capstone"`,
            );
        }

        for (const [sectionIndex, section] of module.sections.entries()) {
            if (
                section.role !== "module_project" &&
                section.role !== "capstone"
            ) {
                continue;
            }

            if (section.topics.length !== 1) {
                issues.push(
                    `${modulePath}.sections[${sectionIndex}]: ${section.role} sections must contain exactly one topic`,
                );
            }
        }
    });

    const firstCapstoneModuleIndex = moduleStructure.findIndex(
        (entry) => entry.isCapstoneModule || entry.capstoneSectionCount > 0,
    );
    const modulesBeforeCapstone =
        firstCapstoneModuleIndex === -1
            ? moduleStructure
            : moduleStructure.slice(0, firstCapstoneModuleIndex);
    const moduleProjectsBeforeCapstone = modulesBeforeCapstone.reduce(
        (sum, entry) => sum + entry.moduleProjectSectionCount,
        0,
    );
    const hasCapstone = moduleStructure.some(
        (entry) => entry.isCapstoneModule || entry.capstoneSectionCount > 0,
    );
    const lastModule = spec.modules[spec.modules.length - 1];
    const lastModulePath = `modules[${spec.modules.length - 1}]`;

    if (
        enforceAuthoredProjectStructure &&
        minProjectsBeforeCapstone > 0 &&
        moduleProjectsBeforeCapstone < minProjectsBeforeCapstone
    ) {
        issues.push(
            `policy.projectPolicy.minProjectsBeforeCapstone requires at least ${minProjectsBeforeCapstone} authored module_project section(s) before the capstone, but found ${moduleProjectsBeforeCapstone}`,
        );
    }

    if (enforceAuthoredProjectStructure && capstoneRequired && !hasCapstone) {
        issues.push(
            "policy.projectPolicy.capstoneRequired requires an authored capstone module or capstone section",
        );
    }

    if (enforceAuthoredProjectStructure && capstoneRequired) {
        if (lastModule?.role !== "capstone") {
            issues.push(
                'policy.projectPolicy.capstoneRequired requires the final module to use role="capstone"',
            );
        }

        const lastModuleCapstoneSections =
            lastModule?.sections.filter((section) => section.role === "capstone") ?? [];

        if (lastModuleCapstoneSections.length !== 1) {
            issues.push(
                "policy.projectPolicy.capstoneRequired requires the final module to contain exactly one capstone section",
            );
        }

        if (lastModuleCapstoneSections.length === 1) {
            const capstoneSection = lastModuleCapstoneSections[0];
            const capstoneSectionIndex = lastModule.sections.findIndex(
                (section) => section === capstoneSection,
            );
            const capstoneSectionPath = `${lastModulePath}.sections[${capstoneSectionIndex}]`;

            if (capstoneSection.role !== "capstone") {
                issues.push(
                    `${capstoneSectionPath}.role must be "capstone" for the final capstone section`,
                );
            }

            if (capstoneSection.topics.length !== 1) {
                issues.push(
                    `${capstoneSectionPath}: capstone sections must contain exactly one topic`,
                );
            }
        }
    }

    return issues;
}

export function assertCourseSpecIntegrity(spec: CourseSpec) {
    const issues = validateCourseSpec(spec);

    if (issues.length) {
        throw new Error(`Course spec validation failed:\n- ${issues.join("\n- ")}`);
    }
}
