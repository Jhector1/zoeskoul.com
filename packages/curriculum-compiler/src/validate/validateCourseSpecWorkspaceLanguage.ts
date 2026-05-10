import type { CourseSpec } from "@zoeskoul/curriculum-contracts";
import { resolveWorkspacePolicy } from "../policy/resolveWorkspacePolicy.js";
import { validateWorkspacePolicy } from "./validateWorkspacePolicy.js";

export function validateCourseSpecWorkspaceLanguage(args: {
    spec: CourseSpec;
}) {
    const subjectSlug = args.spec.subjectSlug;

    const globalPolicy = resolveWorkspacePolicy({
        blueprint: args.spec as never,
    });
    validateWorkspacePolicy({
        text: JSON.stringify(
            {
                title: args.spec.title,
                subtitle: args.spec.subtitle,
                intendedFor: args.spec.intendedFor,
                courseOverview: args.spec.courseOverview,
                assessmentAndDelivery: {
                    suggestedBeginnerRhythm:
                    args.spec.assessmentAndDelivery?.suggestedBeginnerRhythm,
                    recommendedCourseDeliverables:
                    args.spec.assessmentAndDelivery?.recommendedCourseDeliverables,
                    closingNote: args.spec.assessmentAndDelivery?.closingNote,
                },
            },
            null,
            2,
        ),
        policy: globalPolicy,
        location: `${subjectSlug}/course-spec/global`,
    });

    for (const module of args.spec.modules ?? []) {
        const moduleNumber =
            typeof module.moduleNumber === "number"
                ? module.moduleNumber
                : Math.max(0, Number(module.order ?? 1) - 1);

        const policy = resolveWorkspacePolicy({
            blueprint: args.spec as never,
            moduleNumber,
        });
        validateWorkspacePolicy({
            text: JSON.stringify(
                {
                    title: module.title,
                    description: module.description,
                    purpose: module.purpose,
                    learningObjectives: module.learningObjectives,
                    guidedExercises: module.guidedExercises,
                    quizFocus: module.quizFocus,
                    moduleProject: module.moduleProject,
                    recommendedPacing: module.recommendedPacing,
                    typicalOutcome: module.typicalOutcome,
                    sections: module.sections?.map((section) => ({
                        sectionSlug: section.sectionSlug,
                        title: section.title,
                        topics: section.topics?.map((topic) => ({
                            topicId: topic.topicId,
                            title: topic.title,
                            summary: topic.summary,
                            learningGoals: topic.learningGoals,
                        })),
                    })),
                },
                null,
                2,
            ),
            policy,
            location: `${subjectSlug}/${module.moduleSlug}/course-spec`,
        });
    }
}