import { codeFamilyServices } from "../families/code/index.js";
import { createProfileServices } from "../shared/createProfileServices.js";
import { cTrustPolicy } from "./trustPolicy.js";
import { validateCGolden } from "./validateCGolden.js";

export const cProfileServices = createProfileServices({
    profileId: "c",
    family: codeFamilyServices,
    overrides: {
        validateGolden: validateCGolden,
    },
    getTrustPolicy() {
        return cTrustPolicy;
    },
});
