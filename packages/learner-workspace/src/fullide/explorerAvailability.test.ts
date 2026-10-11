import { describe, expect, it } from "vitest";

import { resolveExerciseExplorerAvailability } from "./explorerAvailability";

describe("exercise Explorer availability", () => {
    it("keeps Explorer hidden for a true one-file exercise with no file headroom", () => {
        expect(
            resolveExerciseExplorerAvailability({
                explorerEnabled: true,
                exerciseStateKey: "exercise:single",
                learnerVisibleFileCount: 1,
                canCreateFiles: true,
                maxFiles: 1,
            }),
        ).toBe(false);
    });

    it("shows Explorer for a one-file growing workspace with file headroom", () => {
        expect(
            resolveExerciseExplorerAvailability({
                explorerEnabled: true,
                exerciseStateKey: "exercise:growing",
                learnerVisibleFileCount: 1,
                canCreateFiles: true,
                maxFiles: 150,
            }),
        ).toBe(true);
    });

    it("shows Explorer for an existing multi-file exercise", () => {
        expect(
            resolveExerciseExplorerAvailability({
                explorerEnabled: true,
                exerciseStateKey: "exercise:multi",
                learnerVisibleFileCount: 2,
                canCreateFiles: false,
                maxFiles: 2,
            }),
        ).toBe(true);
    });

    it("never overrides a disabled Explorer service", () => {
        expect(
            resolveExerciseExplorerAvailability({
                explorerEnabled: false,
                exerciseStateKey: "exercise:growing",
                learnerVisibleFileCount: 1,
                canCreateFiles: true,
                maxFiles: 150,
            }),
        ).toBe(false);
    });
});
