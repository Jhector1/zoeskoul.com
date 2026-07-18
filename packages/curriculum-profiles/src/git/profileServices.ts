import { codeFamilyServices } from "../families/code/index.js";
import { createProfileServices } from "../shared/createProfileServices.js";
import { repairGitDraft } from "./repair/repairGitDraft.js";
import { gitTrustPolicy } from "./trustPolicy.js";

export const gitProfileServices = createProfileServices({
    profileId: "git",
    family: codeFamilyServices,
    overrides: {
        repairDraft: repairGitDraft,
    },
    getTrustPolicy() {
        return gitTrustPolicy;
    },
});
