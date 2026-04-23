import type { ManifestKeyPatterns } from "./types.js";

export function makeKeyPatterns(): ManifestKeyPatterns {
    return {
        subjectTitleKey: (subjectSlug) => `subjects.${subjectSlug}.title`,
        subjectDescriptionKey: (subjectSlug) => `subjects.${subjectSlug}.description`,
        subjectMoreComingKey: (subjectSlug) => `subjects.${subjectSlug}.moreComingSoon`,

        moduleTitleKey: (subjectSlug, moduleSlug) => `modules.${subjectSlug}.${moduleSlug}.title`,
        moduleDescriptionKey: (subjectSlug, moduleSlug) =>
            `modules.${subjectSlug}.${moduleSlug}.description`,
        modulePrereqKey: (subjectSlug, moduleSlug, index) =>
            `modules.${subjectSlug}.${moduleSlug}.prereqs.${index}`,
        moduleOutcomeKey: (subjectSlug, moduleSlug, index) =>
            `modules.${subjectSlug}.${moduleSlug}.outcomes.${index}`,
        moduleWhyKey: (subjectSlug, moduleSlug, index) =>
            `modules.${subjectSlug}.${moduleSlug}.why.${index}`,

        sectionTitleKey: (subjectSlug, moduleSlug, sectionSlug) =>
            `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.title`,
        sectionDescriptionKey: (subjectSlug, moduleSlug, sectionSlug) =>
            `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.description`,
        sectionWeeksKey: (subjectSlug, moduleSlug, sectionSlug) =>
            `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.weeks`,
        sectionBulletKey: (subjectSlug, moduleSlug, sectionSlug, index) =>
            `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.bullets.${index}`,

        topicLabelKey: (subjectSlug, moduleSlug, topicId) =>
            `topics.${subjectSlug}.${moduleSlug}.${topicId}.label`,
        topicSummaryKey: (subjectSlug, moduleSlug, topicId) =>
            `topics.${subjectSlug}.${moduleSlug}.${topicId}.summary`,

        topicCardTitleKey: (subjectSlug, moduleSlug, topicId, cardId) =>
            `topics.${subjectSlug}.${moduleSlug}.${topicId}.cards.${cardId}.title`,

        topicProjectStepTitleKey: (subjectSlug, moduleSlug, topicId, stepId) =>
            `topics.${subjectSlug}.${moduleSlug}.${topicId}.projectSteps.${stepId}.title`,

        sketchTitleKey: (subjectSlug, moduleSlug, topicId, sketchId) =>
            `sketches.${subjectSlug}.${moduleSlug}.${topicId}.${sketchId}.title`,
        sketchBodyKey: (subjectSlug, moduleSlug, topicId, sketchId) =>
            `sketches.${subjectSlug}.${moduleSlug}.${topicId}.${sketchId}.bodyMarkdown`,

        exerciseMessageBase: (exerciseId) => `quiz.${exerciseId}`,
    };
}