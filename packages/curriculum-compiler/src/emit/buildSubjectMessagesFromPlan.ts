import type {
    CourseBlueprint,
    CoursePlan,
} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import { moduleOrderToIndex } from "../spec/moduleOrder.js";
import { resolveLogicalSectionSlug } from "./resolveLogicalSectionSlug.js";
import { resolveModuleOutcomes } from "./resolveModuleOutcomes.js";




function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function uniqueNonEmpty(values: string[]): string[] {
    return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function formatWeeks(args: {
    weeksLabel?: string | null;
    weekStart?: number | null;
    weekEnd?: number | null;
    moduleWeekStart?: number | null;
    moduleWeekEnd?: number | null;
}): string | null {
    const explicit = cleanText(args.weeksLabel);
    if (explicit) return explicit;

    const start = args.weekStart ?? args.moduleWeekStart ?? null;
    const end = args.weekEnd ?? args.moduleWeekEnd ?? null;

    if (typeof start !== "number" || typeof end !== "number") return null;

    return start === end ? `Week ${start}` : `Weeks ${start}–${end}`;
}

function sectionDescriptionFallback(args: {
    sectionTitle: string;
    moduleTitle: string;
    topicTitles: string[];
}): string {
    const topics = uniqueNonEmpty(args.topicTitles).slice(0, 3);

    if (topics.length > 0) {
        return `Learn ${topics.join(", ").toLowerCase()} through focused examples and practice.`;
    }

    const sectionTitle = cleanText(args.sectionTitle);
    if (sectionTitle) {
        return `Build practical skills for ${sectionTitle.toLowerCase()} through short lessons and practice.`;
    }

    return `Build practical skills through short lessons and hands-on practice.`;
}



type SubjectMessageEntry = {
    title: string;
    description: string;
    moreComingSoon: string;
};

type ModuleMessageEntry = {
    title: string;
    description: string;
    outcomes: string[];
    why: string[];
};

type SectionMessageEntry = {
    title: string;
    description: string;
    weeks: string | null;
    bullets: string[];
};

type SubjectMessages = {
    subjects: Record<string, SubjectMessageEntry>;
    modules: Record<string, Record<string, ModuleMessageEntry>>;
    sections: Record<string, Record<string, Record<string, SectionMessageEntry>>>;
};

export function buildSubjectMessagesFromPlan(args: {
    blueprint: CourseBlueprint;
    plan: CoursePlan;
    shape: SubjectShapePack;
}): SubjectMessages {
    const { blueprint, plan, shape } = args;

    const subjectSlug = blueprint.subjectSlug;

    const messages: SubjectMessages = {
        subjects: {
            [subjectSlug]: {
                title: blueprint.title,
                description:
                    cleanText(blueprint.description) ||
                    `Build practical skills with ${blueprint.title}.`,
                moreComingSoon: `More ${blueprint.title} lessons are coming soon.`,
            },
        },
        modules: {
            [subjectSlug]: {},
        },
        sections: {
            [subjectSlug]: {},
        },
    };

    const moduleMessages = messages.modules[subjectSlug];
    const sectionMessages = messages.sections[subjectSlug];

    for (const module of plan.modules) {
        const moduleIndex = moduleOrderToIndex(module.order);
        const logicalModuleSlug = module.moduleSlug;
        moduleMessages[logicalModuleSlug] = {
            title: module.title,
            description: module.description ?? module.purpose ?? "",
            outcomes: resolveModuleOutcomes(module),
            why: [
                `Builds confidence with ${module.title.toLowerCase()}.`,
                `Prepares learners for the next skills in the course.`,
            ],
        };

        sectionMessages[logicalModuleSlug] = {};

        for (const section of module.sections) {
            const logicalSectionSlug = resolveLogicalSectionSlug({
                subjectSlug,
                rawSectionSlug: section.sectionSlug,
            });

            const topicTitles = section.topics.map((topic) => topic.title);

            sectionMessages[logicalModuleSlug][logicalSectionSlug] = {
                title: section.title,
                description:
                    cleanText(section.description) ||
                    sectionDescriptionFallback({
                        sectionTitle: section.title,
                        moduleTitle: module.title,
                        topicTitles,
                    }),
                weeks: formatWeeks({
                    weeksLabel: section.weeksLabel,
                    weekStart: section.weekStart,
                    weekEnd: section.weekEnd,
                    moduleWeekStart: module.weekStart,
                    moduleWeekEnd: module.weekEnd,
                }),
                bullets: uniqueNonEmpty([
                    ...(section.bullets ?? []),
                    ...section.topics.map((topic) => topic.title),
                ]).slice(0, 4),
            };
        }
    }

    return messages;
}
