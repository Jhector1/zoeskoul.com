import type { ProfileTrustPolicy } from "../../shared/profileServices.js";
import type { FamilyProfileServices } from "../../shared/createProfileServices.js";
import {
    makeEmptyCritiqueReport,
    makeEmptyGoldenValidationReport,
    makeEmptyRepairReport,
    makeEmptySemanticValidationReport,
} from "../../shared/noopReports.js";

export const conceptFamilyTrustPolicy: ProfileTrustPolicy = {
    profileId: "concept-family",
    autoPublishEnabled: false,
    requiresCritiquePass: true,
    requiresSemanticValidation: false,
    maxHintWarnings: 0,
    maxMediumRepairs: 0,
    allowHighSeverityRepairs: false,
};

export const conceptFamilyServices: FamilyProfileServices = {
    async repairDraft(args) {
        return {
            draft: args.draft,
            report: makeEmptyRepairReport(args.seed.topicId),
        };
    },

    async critiqueDraft(args) {
        return makeEmptyCritiqueReport(args.seed.topicId);
    },

    async validateProfile() {
        return [];
    },

    async validateSemantic(args) {
        return makeEmptySemanticValidationReport(args.seed.topicId);
    },

    async validateGolden(args) {
        return makeEmptyGoldenValidationReport(args.seed.topicId);
    },
};
