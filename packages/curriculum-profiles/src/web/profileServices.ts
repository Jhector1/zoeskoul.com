import { codeFamilyServices } from "../families/code/index.js";
import { createProfileServices } from "../shared/createProfileServices.js";
import { webTrustPolicy } from "./trustPolicy.js";

export const webProfileServices = createProfileServices({
    profileId: "web",
    family: codeFamilyServices,
    getTrustPolicy() {
        return webTrustPolicy;
    },
});
