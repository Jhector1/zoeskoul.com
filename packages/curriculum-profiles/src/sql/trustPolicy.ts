import type { ProfileTrustPolicy } from "../shared/profileServices.js";
import { queryFamilyTrustPolicy } from "../families/query/index.js";

export const sqlTrustPolicy: ProfileTrustPolicy = {
    ...queryFamilyTrustPolicy,
    profileId: "sql",
    autoPublishEnabled: false,
    requiresCritiquePass: true,
    requiresSemanticValidation: true,
    maxHintWarnings: 0,
    maxMediumRepairs: 0,
    allowHighSeverityRepairs: false,
};