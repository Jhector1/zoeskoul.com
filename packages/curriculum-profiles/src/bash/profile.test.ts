import { describe, expect, it } from "vitest";
import { bashProfile } from "./profile.js";

describe("bashProfile", () => {
    it("tells the generator to put required shell tasks in quizDraft", () => {
        const rules = bashProfile.renderAuthoringPromptRules?.({
            seed: {
                plannedExerciseCounts: {
                    counts: {
                        code_input: 3,
                        fill_blank_choice: 2,
                    },
                },
            } as any,
            shape: {} as any,
        }) ?? [];

        const joined = rules.join("\n");

        expect(joined).toContain("exactly 3 Bash/Linux code_input");
        expect(joined).toMatch(/quizDraft/);
        expect(joined).toMatch(/shell_task/);
        expect(joined).toMatch(/terminal_workspace/);
        expect(joined).toMatch(/workspaceExpectations|requiredFolders|requiredFiles/);
        expect(joined).toMatch(/terminalExpectations|requiredCommands|outputRegex/);
        expect(joined).toMatch(/extra fill_blank_choice/);
    });

});
