import type {
    CourseBlueprint,
    CoursePlan,
} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";

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
                description: blueprint.description ?? "",
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
        const logicalModuleSlug = shape.subjectManifest.moduleSlug(module.order - 1);

        moduleMessages[logicalModuleSlug] = {
            title: module.title,
            description: module.description ?? "",
            outcomes: module.sections
                .flatMap((section) => section.topics.flatMap((topic) => topic.learningGoals))
                .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index)
                .slice(0, 5),
            why: [
                `Builds confidence with ${module.title.toLowerCase()}.`,
                `Prepares learners for the next skills in the course.`,
            ],
        };

        sectionMessages[logicalModuleSlug] = {};

        for (const section of module.sections) {
            const logicalSectionSlug = shape.subjectManifest.sectionSlug(
                module.order - 1,
                section.order,
            );

            sectionMessages[logicalModuleSlug][logicalSectionSlug] = {
                title: section.title,
                description: section.description ?? "",
                weeks:
                    module.weekStart != null && module.weekEnd != null
                        ? module.weekStart === module.weekEnd
                            ? `Week ${module.weekStart}`
                            : `Week ${module.weekStart}–${module.weekEnd}`
                        : null,
                bullets: section.topics
                    .map((topic) => topic.title)
                    .filter(Boolean)
                    .slice(0, 4),
            };
        }
    }

    return messages;
}