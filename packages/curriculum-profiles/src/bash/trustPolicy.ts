import type { ProfileTrustPolicy } from "../shared/profileServices.js";
import { codeFamilyTrustPolicy } from "../families/code/index.js";

export const bashTrustPolicy: ProfileTrustPolicy = {
    ...codeFamilyTrustPolicy,
    profileId: "bash",
    autoPublishEnabled: false,
    requiresCritiquePass: true,
    requiresSemanticValidation: true,
    maxHintWarnings: 0,
    maxMediumRepairs: 0,
    allowHighSeverityRepairs: false,
};
