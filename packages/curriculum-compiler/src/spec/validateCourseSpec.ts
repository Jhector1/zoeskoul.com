import type {
    CourseSpec,
    CourseSpecModule,
    CourseSpecSection,
    CourseSpecReleaseWindow,
    ExerciseKindMix,
} from "@zoeskoul/curriculum-contracts";

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
    }
}

export function validateCourseSpec(spec: CourseSpec): string[] {
    const issues: string[] = [];

    if (!isNonEmptyString(spec.authoringFormatVersion)) {
        issues.push("authoringFormatVersion is required");
    }

    if (!isNonEmptyString(spec.subjectSlug)) {
        issues.push("subjectSlug is required");
    }

    if (!isNonEmptyString(spec.profileId)) {
        issues.push("profileId is required");
    }

    if (!isNonEmptyString(spec.title)) {
        issues.push("title is required");
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

    const moduleSlugSet = new Set<string>();
    const sectionSlugSet = new Set<string>();
    const topicIdSet = new Set<string>();

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
            spec.profileId === "sql" &&
            effectiveDatasetStrategy(spec, module) === "module_based" &&
            !isNonEmptyString(module.runtimePolicy?.datasetId)
        ) {
            issues.push(
                `${modulePath}.runtimePolicy.datasetId is required for SQL when datasetStrategy="module_based"`,
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
    });

    return issues;
}

export function assertCourseSpecIntegrity(spec: CourseSpec) {
    const issues = validateCourseSpec(spec);

    if (issues.length) {
        throw new Error(`Course spec validation failed:\n- ${issues.join("\n- ")}`);
    }
}