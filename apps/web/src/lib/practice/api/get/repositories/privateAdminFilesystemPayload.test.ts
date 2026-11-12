import { describe, expect, it } from "vitest";
import { redactAdminFilesystemExpectations } from "./privateAdminFilesystemPayload";

const filesystemContract = {required: [
    { path: "/workspace/private-evidence", kind: "file", mode: "0600", uid: 1000, gid: 1000 },
]};

describe("student-facing practice instance persistence", () => {
    it("never exposes filesystem expectations in nested or top-level public payload", () => {
        const exercise = {
            kind: "code_input",
            language: "bash",
            title: "Capstone",
            prompt: "Verify the project state",
            adminLabFilesystemExpectations: filesystemContract,
            workspace: {
                entryFilePath: "main.sh",
                starterFiles: [
                    {path: "main.sh", content: "pwd\n", adminLabFilesystemExpectations: filesystemContract},
                ],
                nested: {adminLabFilesystemExpectations: filesystemContract, preserve: true},
            },
        };
        const clean = redactAdminFilesystemExpectations(exercise);
        expect(clean).toMatchObject({
            kind: "code_input", language: "bash", title: "Capstone",
            workspace: {entryFilePath: "main.sh", starterFiles: [{path: "main.sh", content: "pwd\n"}], nested: {preserve: true}},
        });
        expect(JSON.stringify(clean)).not.toContain("adminLabFilesystemExpectations");
        expect(JSON.stringify(clean)).not.toContain("/workspace/private-evidence");
        expect(exercise.adminLabFilesystemExpectations).toEqual(filesystemContract);
    });

    it("keeps ordinary Course 1 code exercise data intact", () => {
        const ordinary = {
            kind: "code_input", title: "Linux Fundamentals",
            workspace: {entryFilePath: "main.sh", starterFiles: [{path: "main.sh", content: "ls\n"}]},
            tools: {terminal: true}, terminalExpectations: {requiredCommands: [{pattern: "^ls$"}]},
        };
        expect(redactAdminFilesystemExpectations(ordinary)).toEqual(ordinary);
    });

    it("preserves JSON arrays, nulls and falsey values", () => {
        expect(redactAdminFilesystemExpectations([null, 0, false, "", {keep: 0, adminLabFilesystemExpectations: filesystemContract}]))
            .toEqual([null, 0, false, "", {keep: 0}]);
    });
});
