import { codeFamilyServices } from "../families/code/index.js";
import { createProfileServices } from "../shared/createProfileServices.js";
import { repairGitDraft } from "./repair/repairGitDraft.js";
import { gitTrustPolicy } from "./trustPolicy.js";
import { validateGitProjectJourneyDraft } from "./validateGitProjectJourneyDraft.js";

export const gitProfileServices = createProfileServices({
    profileId: "git",
    family: codeFamilyServices,
    overrides: {
        repairDraft: repairGitDraft,
        async validateSemantic(args) {
            const report = await codeFamilyServices.validateSemantic(args);
            report.issues.push(...validateGitProjectJourneyDraft(args));
            report.ok = !report.issues.some((issue) => issue.severity === "error");
            return report;
        },
    },
    getTrustPolicy() {
        return gitTrustPolicy;
    },
});
