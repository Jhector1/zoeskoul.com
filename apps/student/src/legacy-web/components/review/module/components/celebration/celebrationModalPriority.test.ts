import { describe, expect, it } from "vitest";

import { resolveCelebrationModalKind } from "./celebrationModalPriority";

describe("resolveCelebrationModalKind", () => {
    it("gives final course completion priority when both states are briefly open", () => {
        expect(
            resolveCelebrationModalKind({
                courseCelebrateOpen: true,
                moduleCelebrateOpen: true,
            }),
        ).toBe("course");
    });

    it("shows module completion when the course is not complete", () => {
        expect(
            resolveCelebrationModalKind({
                courseCelebrateOpen: false,
                moduleCelebrateOpen: true,
            }),
        ).toBe("module");
    });

    it("shows no completion modal when neither state is open", () => {
        expect(
            resolveCelebrationModalKind({
                courseCelebrateOpen: false,
                moduleCelebrateOpen: false,
            }),
        ).toBeNull();
    });
});
