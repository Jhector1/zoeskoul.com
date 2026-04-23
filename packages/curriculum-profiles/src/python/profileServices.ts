import { createProfileServices } from "../shared/createProfileServices.js";
import { codeFamilyServices } from "../families/code/index.js";
import { pythonTrustPolicy } from "./trustPolicy.js";
import { repairPythonDraft } from "./repair/repairPythonDraft.js";
import { critiquePythonDraft } from "./critique/critiquePythonDraft.js";
import { validatePythonSemantic } from "./semantic/validatePythonSemantic.js";

export const pythonProfileServices = createProfileServices({
    profileId: "python",
    family: codeFamilyServices,
    overrides: {
        repairDraft: repairPythonDraft,
        critiqueDraft: critiquePythonDraft,
        validateSemantic: validatePythonSemantic,
    },
    getTrustPolicy() {
        return pythonTrustPolicy;
    },
});