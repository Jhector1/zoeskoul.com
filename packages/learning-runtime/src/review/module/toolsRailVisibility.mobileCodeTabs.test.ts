import { describe, expect, it } from "vitest";

import { shouldShowMobileCodeWorkspaceTabs } from "./toolsRailVisibility";

const base = {
    toolsAvailable: true,
    showDesktopRight: false,
    hasRouteWorkspaceExercise: false,
    hasActiveCardWorkspaceExercise: false,
    hasActiveCardRegistryExercise: false,
};

describe("shouldShowMobileCodeWorkspaceTabs", () => {
    it("keeps non-code mobile cards lesson-only by default", () => {
        expect(shouldShowMobileCodeWorkspaceTabs(base)).toBe(false);
    });

    it("shows Code for a route-owned workspace exercise", () => {
        expect(
            shouldShowMobileCodeWorkspaceTabs({
                ...base,
                hasRouteWorkspaceExercise: true,
            }),
        ).toBe(true);
    });

    it("shows Code for a runtime-owned workspace exercise", () => {
        expect(
            shouldShowMobileCodeWorkspaceTabs({
                ...base,
                hasActiveCardWorkspaceExercise: true,
            }),
        ).toBe(true);
    });

    it("shows Code for a registry-owned workspace exercise", () => {
        expect(
            shouldShowMobileCodeWorkspaceTabs({
                ...base,
                hasActiveCardRegistryExercise: true,
            }),
        ).toBe(true);
    });

    it("does not use mobile Code tabs when desktop Tools own the workspace", () => {
        expect(
            shouldShowMobileCodeWorkspaceTabs({
                ...base,
                showDesktopRight: true,
                hasActiveCardRegistryExercise: true,
            }),
        ).toBe(false);
    });

    it("does not use mobile Code tabs when Tools are unavailable", () => {
        expect(
            shouldShowMobileCodeWorkspaceTabs({
                ...base,
                toolsAvailable: false,
                hasActiveCardRegistryExercise: true,
            }),
        ).toBe(false);
    });
});
