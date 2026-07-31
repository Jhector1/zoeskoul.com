import { describe, expect, it } from "vitest";
import { getStateLanguage, stateLanguageMatches } from "./workspaceCodeSource";

describe("workspaceCodeSource language detection", () => {
    it("does not classify empty SQL metadata as SQL", () => {
        const state = {
            language: "python",
            fixedSqlDialect: "",
            sqlDatasetId: "",
            sqlSchemaSql: "",
            sqlSeedSql: "",
            runtime: { datasetId: "" },
        };

        expect(getStateLanguage(state)).toBe("python");
        expect(stateLanguageMatches(state, "python")).toBe(true);
        expect(stateLanguageMatches(state, "sql")).toBe(false);
    });

    it("still classifies non-blank SQL metadata as SQL when no explicit language exists", () => {
        expect(getStateLanguage({ sqlSchemaSql: "create table users(id int);" })).toBe("sql");
        expect(getStateLanguage({ runtime: { datasetId: "students_intro" } })).toBe("sql");
    });
});
