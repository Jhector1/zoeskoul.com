import {
    codeFamilyServices,
    codeFamilyTrustPolicy,
} from "../families/code/index.js";
import { createProfileServices } from "../shared/createProfileServices.js";
import type { ProfileTrustPolicy } from "../shared/profileServices.js";

export const apiTrustPolicy: ProfileTrustPolicy = {
    ...codeFamilyTrustPolicy,
    profileId: "api",
    autoPublishEnabled: false,
    requiresCritiquePass: true,
    requiresSemanticValidation: true,
    maxHintWarnings: 0,
    maxMediumRepairs: 0,
    allowHighSeverityRepairs: false,
};

export const apiProfileServices = createProfileServices({
    profileId: "api",
    family: codeFamilyServices,
    getTrustPolicy() {
        return apiTrustPolicy;
    },
});
