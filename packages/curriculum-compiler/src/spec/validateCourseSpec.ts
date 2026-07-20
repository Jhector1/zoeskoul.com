import type {
    CourseSpec,
    CourseSpecModule,
    CourseSpecSection,
    CourseSpecReleaseWindow,
    ExerciseKindMix,
} from "@zoeskoul/curriculum-contracts";
import { normalizeWorkspacePath, validateToolPresentationPolicy } from "@zoeskoul/curriculum-contracts";
import {
    baseCourseGenerationPolicy,
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

function validateProjectJourneys(spec: CourseSpec, issues: string[]) {
    const journeys = spec.projectJourneys ?? [];
    const ids = new Set<string>();
    const roots = new Set<string>();
    const referencesByJourney = new Map<
        string,
        Array<{
            path: string;
            entryMilestone: string;
            exitMilestone: string;
        }>
    >();

    journeys.forEach((journey, index) => {
        const path = `projectJourneys[${index}]`;
        if (!isNonEmptyString(journey.id)) {
            issues.push(`${path}.id is required`);
        } else if (ids.has(journey.id)) {
            issues.push(`${path}: duplicate journey id "${journey.id}"`);
        } else {
            ids.add(journey.id);
        }

        if (!isNonEmptyString(journey.title)) {
            issues.push(`${path}.title is required`);
        }
        if (!(["guided", "module_project", "capstone"] as const).includes(journey.role)) {
            issues.push(`${path}.role is invalid`);
        }
        if (!(["course", "cross_module", "topic"] as const).includes(journey.continuity)) {
            issues.push(`${path}.continuity is invalid`);
        }
        if (!(["guided", "reapplication", "independent"] as const).includes(journey.supportLevel)) {
            issues.push(`${path}.supportLevel is invalid`);
        }
        if (
            journey.exactEditInstructionsRequired !== undefined &&
            typeof journey.exactEditInstructionsRequired !== "boolean"
        ) {
            issues.push(`${path}.exactEditInstructionsRequired must be boolean when provided`);
        }
        if (!isNonEmptyString(journey.repositoryPath)) {
            issues.push(`${path}.repositoryPath is required`);
        } else {
            try {
                const normalizedRepositoryPath = normalizeWorkspacePath(
                    journey.repositoryPath,
                );
                if (normalizedRepositoryPath !== journey.repositoryPath) {
                    issues.push(
                        `${path}.repositoryPath must be a normalized relative workspace directory`,
                    );
                } else if (roots.has(normalizedRepositoryPath)) {
                    issues.push(
                        `${path}: repositoryPath "${normalizedRepositoryPath}" is reused by another journey`,
                    );
                } else {
                    roots.add(normalizedRepositoryPath);
                }
            } catch {
                issues.push(
                    `${path}.repositoryPath must be a safe relative workspace directory`,
                );
            }
        }
        if (!Array.isArray(journey.milestoneOrder) || journey.milestoneOrder.length === 0) {
            issues.push(`${path}.milestoneOrder must be a non-empty array`);
        } else {
            const seen = new Set<string>();
            journey.milestoneOrder.forEach((milestone, milestoneIndex) => {
                if (!isNonEmptyString(milestone)) {
                    issues.push(`${path}.milestoneOrder[${milestoneIndex}] must not be blank`);
                } else if (seen.has(milestone)) {
                    issues.push(`${path}: duplicate milestone "${milestone}"`);
                } else {
                    seen.add(milestone);
                }
            });
        }
    });

    spec.modules.forEach((module, moduleIndex) => {
        module.sections.forEach((section, sectionIndex) => {
            section.topics.forEach((topic, topicIndex) => {
                const ref = topic.projectJourney;
                const topicPath = `modules[${moduleIndex}].sections[${sectionIndex}].topics[${topicIndex}]`;
                const brief = topic.projectBrief;
                if (!ref) {
                    if (brief?.journeyId) {
                        const briefJourney = journeys.find(
                            (candidate) => candidate.id === brief.journeyId,
                        );
                        if (!briefJourney) {
                            issues.push(
                                `${topicPath}.projectBrief.journeyId references unknown journey "${brief.journeyId}"`,
                            );
                        } else {
                            const milestones = new Set(briefJourney.milestoneOrder ?? []);
                            if (
                                brief.continuesFromMilestone &&
                                !milestones.has(brief.continuesFromMilestone)
                            ) {
                                issues.push(
                                    `${topicPath}.projectBrief.continuesFromMilestone references unknown milestone "${brief.continuesFromMilestone}"`,
                                );
                            }
                            if (
                                brief.finalMilestone &&
                                !milestones.has(brief.finalMilestone)
                            ) {
                                issues.push(
                                    `${topicPath}.projectBrief.finalMilestone references unknown milestone "${brief.finalMilestone}"`,
                                );
                            }
                        }
                    }
                    return;
                }
                const path = `${topicPath}.projectJourney`;
                const journey = journeys.find((candidate) => candidate.id === ref.journeyId);
                if (!journey) {
                    issues.push(`${path}.journeyId references unknown journey "${ref.journeyId}"`);
                    return;
                }
                const milestoneSet = new Set(journey.milestoneOrder ?? []);
                if (!milestoneSet.has(ref.entryMilestone)) {
                    issues.push(`${path}.entryMilestone references unknown milestone "${ref.entryMilestone}"`);
                }
                if (!milestoneSet.has(ref.exitMilestone)) {
                    issues.push(`${path}.exitMilestone references unknown milestone "${ref.exitMilestone}"`);
                }
                const entryIndex = journey.milestoneOrder?.indexOf(ref.entryMilestone) ?? -1;
                const exitIndex = journey.milestoneOrder?.indexOf(ref.exitMilestone) ?? -1;
                if (entryIndex >= 0 && exitIndex >= 0 && entryIndex > exitIndex) {
                    issues.push(`${path}: entryMilestone must not come after exitMilestone`);
                }

                const expectedJourneyRole =
                    section.role === "module_project"
                        ? "module_project"
                        : section.role === "capstone"
                          ? "capstone"
                          : "guided";
                if (journey.role !== expectedJourneyRole) {
                    issues.push(
                        `${path}: section role "${section.role ?? "lesson"}" requires a "${expectedJourneyRole}" project journey`,
                    );
                }

                const references = referencesByJourney.get(journey.id) ?? [];
                references.push({
                    path,
                    entryMilestone: ref.entryMilestone,
                    exitMilestone: ref.exitMilestone,
                });
                referencesByJourney.set(journey.id, references);

                if (!brief) return;
                if (brief.journeyId && brief.journeyId !== ref.journeyId) {
                    issues.push(
                        `${path}: projectBrief.journeyId must match projectJourney.journeyId`,
                    );
                }
                if (
                    brief.continuesFromMilestone &&
                    brief.continuesFromMilestone !== ref.entryMilestone
                ) {
                    issues.push(
                        `${path}: projectBrief.continuesFromMilestone must match projectJourney.entryMilestone`,
                    );
                }
                if (
                    brief.finalMilestone &&
                    brief.finalMilestone !== ref.exitMilestone
                ) {
                    issues.push(
                        `${path}: projectBrief.finalMilestone must match projectJourney.exitMilestone`,
                    );
                }
            });
        });
    });

    journeys.forEach((journey, journeyIndex) => {
        const references = referencesByJourney.get(journey.id) ?? [];
        if (references.length === 0) {
            issues.push(
                `projectJourneys[${journeyIndex}] must be referenced by at least one topic`,
            );
            return;
        }

        const milestoneOrder = journey.milestoneOrder ?? [];
        const firstMilestone = milestoneOrder[0];
        const finalMilestone = milestoneOrder[milestoneOrder.length - 1];
        const firstReference = references[0];
        const finalReference = references[references.length - 1];

        if (
            firstMilestone &&
            firstReference &&
            firstReference.entryMilestone !== firstMilestone
        ) {
            issues.push(
                `projectJourneys[${journeyIndex}]: first topic must enter at initial milestone "${firstMilestone}"`,
            );
        }
        if (
            finalMilestone &&
            finalReference &&
            finalReference.exitMilestone !== finalMilestone
        ) {
            issues.push(
                `projectJourneys[${journeyIndex}]: final topic must exit at final milestone "${finalMilestone}"`,
            );
        }

        for (let index = 1; index < references.length; index += 1) {
            const previous = references[index - 1];
            const current = references[index];
            if (!previous || !current) continue;
            if (current.entryMilestone === previous.exitMilestone) continue;

            issues.push(
                `${current.path}: entryMilestone "${current.entryMilestone}" must continue from previous exitMilestone "${previous.exitMilestone}" for journey "${journey.id}"`,
            );
        }
    });
}

function validateProjectBrief(args: {
    brief: CourseSpecSection["topics"][number]["projectBrief"];
    path: string;
    required: boolean;
    issues: string[];
}) {
    const { brief, path, required, issues } = args;

    if (!brief) {
        if (required) {
            issues.push(`${path}.projectBrief is required for the final capstone topic`);
        }
        return;
    }

    if (
        typeof brief.stepCountTarget !== "number" ||
        !Number.isInteger(brief.stepCountTarget) ||
        brief.stepCountTarget <= 0
    ) {
        issues.push(`${path}.projectBrief.stepCountTarget must be a positive integer`);
    }

    if (
        brief.flow != null &&
        brief.flow !== "standalone" &&
        brief.flow !== "progressive"
    ) {
        issues.push(`${path}.projectBrief.flow must be "standalone" or "progressive" when provided`);
    }

    for (const field of ["scenario", "role", "workspace", "deliverable"] as const) {
        const value = brief[field];
        if (value != null && !isNonEmptyString(value)) {
            issues.push(`${path}.projectBrief.${field} must not be blank when provided`);
        }
    }

    if (brief.requirements != null) {
        if (!Array.isArray(brief.requirements)) {
            issues.push(`${path}.projectBrief.requirements must be an array when provided`);
        } else {
            brief.requirements.forEach((requirement, index) => {
                if (!isNonEmptyString(requirement)) {
                    issues.push(`${path}.projectBrief.requirements[${index}] must not be blank`);
                }
            });
        }
    }

    if (brief.stepLadder != null) {
        if (!Array.isArray(brief.stepLadder) || brief.stepLadder.length === 0) {
            issues.push(`${path}.projectBrief.stepLadder must be a non-empty array when provided`);
            return;
        }

        if (
            Number.isInteger(brief.stepCountTarget) &&
            brief.stepCountTarget > 0 &&
            brief.stepLadder.length !== brief.stepCountTarget
        ) {
            issues.push(
                `${path}.projectBrief.stepLadder must contain exactly ${brief.stepCountTarget} step(s) to match stepCountTarget`,
            );
        }

        brief.stepLadder.forEach((step, index) => {
            const stepPath = `${path}.projectBrief.stepLadder[${index}]`;
            if (!step || typeof step !== "object") {
                issues.push(`${stepPath} must be an object`);
                return;
            }
            if (step.step !== index + 1) {
                issues.push(`${stepPath}.step must equal ${index + 1}`);
            }
            if (!isNonEmptyString(step.title)) {
                issues.push(`${stepPath}.title is required`);
            }
            if (!isNonEmptyString(step.requirement)) {
                issues.push(`${stepPath}.requirement is required`);
            }
        });
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

    issues.push(...validateToolPresentationPolicy(section.tools, `${path}.tools`));

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

        issues.push(...validateToolPresentationPolicy(topic.tools, `${topicPath}.tools`));
        for (const [lessonId, policy] of Object.entries(topic.lessonTools ?? {})) {
            issues.push(
                ...validateToolPresentationPolicy(
                    policy,
                    `${topicPath}.lessonTools.${lessonId}`,
                ),
            );
        }
        for (const [exerciseId, policy] of Object.entries(topic.exerciseTools ?? {})) {
            issues.push(
                ...validateToolPresentationPolicy(
                    policy,
                    `${topicPath}.exerciseTools.${exerciseId}`,
                ),
            );
        }

        const isFinalCapstoneTopic = section.role === "capstone";
        validateProjectBrief({
            brief: topic.projectBrief,
            path: topicPath,
            required: isFinalCapstoneTopic,
            issues,
        });

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
    issues.push(...validateToolPresentationPolicy(spec.tools, "tools"));
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

    validateProjectJourneys(spec, issues);

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
    const slugConvention = spec.policy?.qualityPolicy?.slugConvention;
    if (
        slugConvention != null &&
        slugConvention !== "explicit_module_section"
    ) {
        issues.push(
            'policy.qualityPolicy.slugConvention must be "explicit_module_section" when provided',
        );
    }
    const requireModuleProject =
        spec.policy?.qualityPolicy?.requireModuleProject === true;
    const maxModuleProjectLength =
        spec.policy?.qualityPolicy?.maxModuleProjectLength ?? 320;
    const minProjectsBeforeCapstone =
        spec.policy?.projectPolicy?.minProjectsBeforeCapstone ?? 0;
    const capstoneRequired =
        spec.policy?.projectPolicy?.capstoneRequired ??
        baseCourseGenerationPolicy.projects.requireFinalCapstone;
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

        if (
            slugConvention === "explicit_module_section" &&
            isNonEmptyString(spec.courseSlug) &&
            typeof module.moduleNumber === "number" &&
            Number.isFinite(module.moduleNumber) &&
            isNonEmptyString(module.moduleSlug)
        ) {
            const expectedModulePrefix =
                `${spec.courseSlug}-module-${module.moduleNumber}-`;

            if (
                !module.moduleSlug.startsWith(expectedModulePrefix) ||
                module.moduleSlug.length === expectedModulePrefix.length
            ) {
                issues.push(
                    `${modulePath}.moduleSlug must start with "${expectedModulePrefix}" and include a descriptive suffix when slugConvention="explicit_module_section"`,
                );
            }
        }

        if (typeof module.moduleNumber !== "number" || !Number.isFinite(module.moduleNumber)) {
            issues.push(`${modulePath}.moduleNumber is required`);
        }

        if (!isNonEmptyString(module.title)) {
            issues.push(`${modulePath}.title is required`);
        }

        issues.push(...validateToolPresentationPolicy(module.tools, `${modulePath}.tools`));

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
            const sectionPath = `${modulePath}.sections[${sectionIndex}]`;

            validateSection(
                section,
                module,
                sectionPath,
                requireUniqueSectionSlugs ? sectionSlugSet : new Set<string>(),
                topicIdSet,
                allowBlankTopicIds,
                allowDuplicateTopicIds,
                issues,
            );

            if (
                slugConvention === "explicit_module_section" &&
                isNonEmptyString(spec.courseSlug) &&
                typeof module.moduleNumber === "number" &&
                Number.isFinite(module.moduleNumber) &&
                isNonEmptyString(section.sectionSlug)
            ) {
                const expectedSectionPrefix =
                    `${spec.courseSlug}-section-${module.moduleNumber}-`;

                if (
                    !section.sectionSlug.startsWith(expectedSectionPrefix) ||
                    section.sectionSlug.length === expectedSectionPrefix.length
                ) {
                    issues.push(
                        `${sectionPath}.sectionSlug must start with "${expectedSectionPrefix}" and include a descriptive suffix when slugConvention="explicit_module_section"`,
                    );
                }
            }
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

        if (module.role === "capstone" && module.sections.length !== 1) {
            issues.push(
                `${modulePath}: capstone modules must contain exactly one section`,
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

    const authoredCapstoneModules = moduleStructure.filter(
        (entry) => entry.isCapstoneModule || entry.capstoneSectionCount > 0,
    );

    if (authoredCapstoneModules.length > 1) {
        issues.push(
            `course authoring must contain at most one capstone module, but found ${authoredCapstoneModules.length}`,
        );
    }

    if (
        authoredCapstoneModules.length === 1 &&
        authoredCapstoneModules[0].moduleIndex !== spec.modules.length - 1
    ) {
        issues.push("the authored capstone module must be the final module in the course");
    }

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

        if (authoredCapstoneModules.length !== 1) {
            issues.push(
                `policy.projectPolicy.capstoneRequired requires exactly one authored capstone module, but found ${authoredCapstoneModules.length}`,
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
