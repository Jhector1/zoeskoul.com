import { createProfileServices } from "../shared/createProfileServices.js";
import { conceptFamilyServices } from "../families/concept/index.js";
import type { ProfileTrustPolicy } from "../shared/profileServices.js";

const mathTrustPolicy: ProfileTrustPolicy = {
    profileId: "math",
    autoPublishEnabled: false,
    requiresCritiquePass: true,
    requiresSemanticValidation: false,
    maxHintWarnings: 0,
    maxMediumRepairs: 0,
    allowHighSeverityRepairs: false,
};

export const mathProfileServices = createProfileServices({
    profileId: "math",
    family: conceptFamilyServices,
    getTrustPolicy() {
        return mathTrustPolicy;
    },
});
