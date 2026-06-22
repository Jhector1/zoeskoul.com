import { createProfileServices } from "../shared/createProfileServices.js";
import { codeFamilyServices } from "../families/code/index.js";
import { bashTrustPolicy } from "./trustPolicy.js";
import { repairBashDraft } from "./repair/repairBashDraft.js";

export const bashProfileServices = createProfileServices({
    profileId: "bash",
    family: codeFamilyServices,
    overrides: {
        repairDraft: repairBashDraft,
    },
    getTrustPolicy() {
        return bashTrustPolicy;
    },
});
