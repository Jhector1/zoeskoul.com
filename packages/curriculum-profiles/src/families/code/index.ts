import type { ProfileTrustPolicy } from "../../shared/profileServices.js";
import type { FamilyProfileServices } from "../../shared/createProfileServices.js";
import {
    makeEmptyCritiqueReport,
    makeEmptyRepairReport,
    makeEmptySemanticValidationReport,
} from "../../shared/noopReports.js";
import { validateGoldenTopicBundle } from "../../shared/validateGoldenTopicBundle.js";
import { validateProgrammingTeachingSketches } from "../../shared/validateProgrammingTeachingSketches.js";

export const codeFamilyTrustPolicy: ProfileTrustPolicy = {
    profileId: "code-family",
    autoPublishEnabled: false,
    requiresCritiquePass: true,
    requiresSemanticValidation: true,
    maxHintWarnings: 0,
    maxMediumRepairs: 0,
    allowHighSeverityRepairs: false,
};

export const codeFamilyServices: FamilyProfileServices = {
    async repairDraft(args) {
        return {
            draft: args.draft,
            report: makeEmptyRepairReport(args.seed.topicId),
        };
    },

    async critiqueDraft(args) {
        const report = makeEmptyCritiqueReport(args.seed.topicId);

        for (const exercise of args.draft.quizDraft) {
            if (
                (exercise.kind === "single_choice" || exercise.kind === "multi_choice") &&
                exercise.options.length < 3
            ) {
                report.issues.push({
                    code: "WEAK_DISTRACTORS",
                    category: "pedagogy",
                    severity: "warn",
                    exerciseId: exercise.id,
                    message: "Question has too few options for strong distractors.",
                });
            }
        }

        report.ok = !report.issues.some((issue) => issue.severity === "error");
        return report;
    },

    async validateProfile() {
        return [];
    },

    async validateSemantic(args) {
        const report = makeEmptySemanticValidationReport(args.seed.topicId);
        report.issues.push(
            ...validateProgrammingTeachingSketches({
                profileId: "code-family",
                draft: args.draft,
            }),
        );
        report.ok = !report.issues.some((issue) => issue.severity === "error");
        return report;
    },

    async validateGolden(args) {
        return validateGoldenTopicBundle(args);
    },
};
