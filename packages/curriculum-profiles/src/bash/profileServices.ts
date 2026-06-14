import { createProfileServices } from "../shared/createProfileServices.js";
import { codeFamilyServices } from "../families/code/index.js";
import { bashTrustPolicy } from "./trustPolicy.js";

export const bashProfileServices = createProfileServices({
    profileId: "bash",
    family: codeFamilyServices,
    getTrustPolicy() {
        return bashTrustPolicy;
    },
});
