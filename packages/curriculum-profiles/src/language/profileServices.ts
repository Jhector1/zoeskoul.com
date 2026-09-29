import { conceptFamilyServices } from "../families/concept/index.js";
import { createProfileServices } from "../shared/createProfileServices.js";
import type { ProfileTrustPolicy } from "../shared/profileServices.js";

const languageTrustPolicy: ProfileTrustPolicy = {
    profileId: "language",
    autoPublishEnabled: false,
    requiresCritiquePass: true,
    requiresSemanticValidation: false,
    maxHintWarnings: 0,
    maxMediumRepairs: 0,
    allowHighSeverityRepairs: false,
};

export const languageProfileServices = createProfileServices({
    profileId: "language",
    family: conceptFamilyServices,
    getTrustPolicy() {
        return languageTrustPolicy;
    },
});
