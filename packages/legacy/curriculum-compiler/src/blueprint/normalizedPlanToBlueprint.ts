import type {
    NormalizedCoursePlan,
    NormalizedPlanModule,
    NormalizedPlanSection,
    NormalizedPlanTopic,
} from "@zoeskoul/curriculum-contracts";

type RuntimeDefaults = {
    kind: "sql";
    datasetId: string;
    fixedSqlDialect: "sqlite";
    resultShape: "table";
};

export type GeneratedBlueprintSeed = {
    blueprint: {
        subject: {
            slug: string;
            genKey: string;
            order: number;
            accessPolicy: "free" | "paid";
            status: "active" | "draft" | "archived";
            titleKey: string;
            descriptionKey: string;
            meta: {
                curriculum: {
                    plannedModuleCount: number;
                    isTerminalRelease: boolean;
                    moreComingMessageKey: string;
                };
                completionPolicy: {
                    requireAllPublishedModules: boolean;
                    rewardEnabledByDefault: boolean;
                    certificateEnabledByDefault: boolean;
                };
            };
        };
        modules: Array<{
            slug: string;
            prefix: string;
            order: number;
            titleKey: string;
            descriptionKey: string;
            weekStart: number;
            weekEnd: number;
            accessOverride: "free" | "paid";
            runtimeDefaults?: RuntimeDefaults;
            meta: {
                estimatedMinutes: number;
                prereqKeys: string[];
                outcomeKeys: string[];
                whyKeys: string[];
            };
            sections: Array<{
                slug: string;
                order: number;
                titleKey: string;
                descriptionKey: string;
                meta: {
                    module: number;
                    weeksKey: string;
                    bulletKeys: string[];
                };
                topics: string[];
            }>;
        }>;
    };
    messages: Record<string, unknown>;
};

function slugify(input: string): string {
    return input
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/%/g, " percent ")
        .replace(/_/g, " underscore ")
        .replace(/<>/g, " not equals ")
        .replace(/!=/g, " not equals ")
        .replace(/>=/g, " greater than or equal ")
        .replace(/<=/g, " less than or equal ")
        .replace(/>/g, " greater than ")
        .replace(/</g, " less than ")
        .replace(/=/g, " equals ")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");
}

function compactSubjectPrefix(subjectSlug: string): string {
    return subjectSlug.replace(/[^a-z0-9]/gi, "");
}

function estimateMinutes(module: NormalizedPlanModule): number {
    const topicCount = module.sections.reduce((sum, s) => sum + s.topics.length, 0);
    return Math.max(45, topicCount * 8);
}

function chooseDatasetId(module: NormalizedPlanModule): string {
    const text = `${module.title} ${module.purpose}`.toLowerCase();

    if (
        text.includes("text") ||
        text.includes("null") ||
        text.includes("cleanup") ||
        text.includes("search-and-cleanup")
    ) {
        return "customers_cleanup";
    }

    return "products_catalog";
}

function isSqlRuntimeModule(module: NormalizedPlanModule): boolean {
    return module.order !== 0;
}

function synthesizeOutcomes(module: NormalizedPlanModule): string[] {
    if (module.learningObjectives.length > 0) {
        return module.learningObjectives;
    }

    if (module.guidedExercises.length > 0) {
        return module.guidedExercises.slice(0, 3).map((x) => `Practice: ${x}`);
    }

    if (module.quizFocus.length > 0) {
        return module.quizFocus.slice(0, 3).map((x) => `Understand: ${x}`);
    }

    return [`Complete ${module.title} successfully.`];
}

function synthesizeWhy(module: NormalizedPlanModule): string[] {
    const why: string[] = [];

    if (module.purpose) why.push(module.purpose);
    if (module.quizFocus[0]) why.push(`Key check: ${module.quizFocus[0]}`);

    return why.length
        ? why.slice(0, 2)
        : [`This module builds practical confidence in ${module.title}.`];
}

function sectionDescription(section: NormalizedPlanSection): string {
    return `Learn ${section.title.toLowerCase()} through focused beginner topics.`;
}

function sectionWeeks(module: NormalizedPlanModule): string {
    return `Week ${module.order + 1}`;
}

function specialTopicId(title: string): string | null {
    const t = title.trim();

    switch (t) {
        case "=":
            return "equals_operator";
        case "!=":
        case "<>":
        case "!= or <>":
            return "not_equals_operator";
        case ">":
            return "greater_than_operator";
        case "<":
            return "less_than_operator";
        case ">=, <=":
            return "greater_and_less_equal_operators";
        case "% wildcard":
            return "percent_wildcard";
        case "_ wildcard":
            return "underscore_wildcard";
        default:
            return null;
    }
}

function makeUniqueTopicId(
    topic: NormalizedPlanTopic,
    used: Set<string>,
    section: NormalizedPlanSection,
): string {
    const special = specialTopicId(topic.title);
    let base =
        special ??
        topic.topicId?.trim() ??
        slugify(topic.title) ??
        "";

    if (!base) {
        base = `topic_${section.sectionSlug}_${topic.order}`;
    }

    let candidate = base;
    let n = 2;

    while (!candidate || used.has(candidate)) {
        candidate = `${base}_${n}`;
        n += 1;
    }

    used.add(candidate);
    return candidate;
}

function ensureNestedRecord(
    root: Record<string, unknown>,
    keys: string[],
): Record<string, unknown> {
    let current: Record<string, unknown> = root;

    for (const key of keys) {
        if (!current[key] || typeof current[key] !== "object") {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }

    return current;
}

export function normalizedPlanToBlueprint(
    plan: NormalizedCoursePlan,
): GeneratedBlueprintSeed {
    const subjectSlug = plan.subjectSlug;
    const subjectTitleKey = `subjects.${subjectSlug}.title`;
    const subjectDescriptionKey = `subjects.${subjectSlug}.description`;

    const modulesMessages = ensureNestedRecord({}, ["modules", subjectSlug]);
    const sectionsMessages = ensureNestedRecord({}, ["sections", subjectSlug]);
    const subjectsMessages = ensureNestedRecord({}, ["subjects"]);

    subjectsMessages[subjectSlug] = {
        title: plan.title,
        description: plan.description ?? `${plan.title}.`,
        moreComingSoon: "More modules coming soon.",
    };

    const usedTopicIds = new Set<string>();

    const blueprintModules = plan.modules.map((module) => {
        const moduleSlug = `${subjectSlug}_module_${module.order}`;
        const modulePrefix = `${compactSubjectPrefix(subjectSlug)}${module.order}`;
        const moduleTitleKey = `modules.${subjectSlug}.${moduleSlug}.title`;
        const moduleDescriptionKey = `modules.${subjectSlug}.${moduleSlug}.description`;

        const outcomes = synthesizeOutcomes(module);
        const why = synthesizeWhy(module);

        modulesMessages[moduleSlug] = {
            title: module.title,
            description: module.purpose,
            outcomes,
            why,
        };

        const sectionMessagesForModule = ensureNestedRecord(
            sectionsMessages,
            [moduleSlug],
        );

        const blueprintSections = module.sections.map((section) => {
            const sectionTitleKey = `sections.${subjectSlug}.${moduleSlug}.${section.sectionSlug}.title`;
            const sectionDescriptionKey = `sections.${subjectSlug}.${moduleSlug}.${section.sectionSlug}.description`;
            const weeksKey = `sections.${subjectSlug}.${moduleSlug}.${section.sectionSlug}.weeks`;

            const cleanedTopicIds = section.topics.map((topic) =>
                makeUniqueTopicId(topic, usedTopicIds, section),
            );

            sectionMessagesForModule[section.sectionSlug] = {
                title: section.title,
                description: sectionDescription(section),
                weeks: sectionWeeks(module),
                bullets: section.topics.map((topic) => topic.title),
            };

            return {
                slug: section.sectionSlug,
                order: section.order,
                titleKey: sectionTitleKey,
                descriptionKey: sectionDescriptionKey,
                meta: {
                    module: module.order,
                    weeksKey,
                    bulletKeys: section.topics.map(
                        (_, index) =>
                            `sections.${subjectSlug}.${moduleSlug}.${section.sectionSlug}.bullets.${index}`,
                    ),
                },
                topics: cleanedTopicIds,
            };
        });

        return {
            slug: moduleSlug,
            prefix: modulePrefix,
            order: module.order,
            titleKey: moduleTitleKey,
            descriptionKey: moduleDescriptionKey,
            weekStart: module.order + 1,
            weekEnd: module.order + 1,
            accessOverride: "free" as const,
            ...(isSqlRuntimeModule(module)
                ? {
                    runtimeDefaults: {
                        kind: "sql" as const,
                        datasetId: chooseDatasetId(module),
                        fixedSqlDialect: "sqlite" as const,
                        resultShape: "table" as const,
                    },
                }
                : {}),
            meta: {
                estimatedMinutes: estimateMinutes(module),
                prereqKeys:
                    module.order > 0
                        ? [`modules.${subjectSlug}.${subjectSlug}_module_${module.order - 1}.title`]
                        : [],
                outcomeKeys: outcomes.map(
                    (_, index) => `modules.${subjectSlug}.${moduleSlug}.outcomes.${index}`,
                ),
                whyKeys: why.map(
                    (_, index) => `modules.${subjectSlug}.${moduleSlug}.why.${index}`,
                ),
            },
            sections: blueprintSections,
        };
    });

    return {
        blueprint: {
            subject: {
                slug: subjectSlug,
                genKey: subjectSlug,
                order: 10,
                accessPolicy: "free",
                status: "active",
                titleKey: subjectTitleKey,
                descriptionKey: subjectDescriptionKey,
                meta: {
                    curriculum: {
                        plannedModuleCount: plan.modules.length,
                        isTerminalRelease: true,
                        moreComingMessageKey: `subjects.${subjectSlug}.moreComingSoon`,
                    },
                    completionPolicy: {
                        requireAllPublishedModules: true,
                        rewardEnabledByDefault: true,
                        certificateEnabledByDefault: true,
                    },
                },
            },
            modules: blueprintModules,
        },
        messages: {
            subjects: subjectsMessages,
            modules: {
                [subjectSlug]: modulesMessages,
            },
            sections: {
                [subjectSlug]: sectionsMessages,
            },
        },
    };
}