import type { ProfileTrustPolicy } from "../shared/profileServices.js";
import { codeFamilyTrustPolicy } from "../families/code/index.js";

export const pythonTrustPolicy: ProfileTrustPolicy = {
    ...codeFamilyTrustPolicy,
    profileId: "python",
    autoPublishEnabled: false,
    requiresCritiquePass: true,
    requiresSemanticValidation: false,
    maxHintWarnings: 0,
    maxMediumRepairs: 0,
    allowHighSeverityRepairs: false,
};