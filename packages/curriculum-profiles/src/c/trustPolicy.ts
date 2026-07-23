import type { ProfileTrustPolicy } from "../shared/profileServices.js";
import { codeFamilyTrustPolicy } from "../families/code/index.js";

export const cTrustPolicy: ProfileTrustPolicy = {
    ...codeFamilyTrustPolicy,
    profileId: "c",
};
