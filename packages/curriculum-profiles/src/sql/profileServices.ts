import { createProfileServices } from "../shared/createProfileServices.js";
import { queryFamilyServices } from "../families/query/index.js";
import { sqlTrustPolicy } from "./trustPolicy.js";
import { repairSqlDraft } from "./repair/repairSqlDraft.js";
import { critiqueSqlDraft } from "./critique/critiqueSqlDraft.js";
import { validateSqlDatasetConsistency } from "./validate/validateSqlDatasetConsistency.js";
import { validateSqlSemantic } from "./semantic/validateSqlSemantic.js";

export const sqlProfileServices = createProfileServices({
    profileId: "sql",
    family: queryFamilyServices,
    overrides: {
        repairDraft: repairSqlDraft,
        critiqueDraft: critiqueSqlDraft,
        async validateProfile(args) {
            return validateSqlDatasetConsistency(args);
        },
        validateSemantic: validateSqlSemantic,
    },
    getTrustPolicy() {
        return sqlTrustPolicy;
    },
});