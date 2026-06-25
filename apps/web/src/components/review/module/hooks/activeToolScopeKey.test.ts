import { describe, expect, it } from "vitest";
import { resolveActiveToolScopeKey } from "./activeToolScopeKey";

describe("resolveActiveToolScopeKey", () => {
    it("prefers the route-owned exercise when present", () => {
        expect(
            resolveActiveToolScopeKey({
                activeExerciseStateKey: "python-v2:module-1:section:topic:exercise:q9",
                activeCardWorkspaceExerciseKey: "python-v2:module-1:section:topic:exercise:q10",
                fallbackCardScopeKey: "card-scope:general",
            }),
        ).toBe("python-v2:module-1:section:topic:exercise:q9");
    });

    it("uses the active card runtime exercise for embedded try-it cards", () => {
        expect(
            resolveActiveToolScopeKey({
                activeExerciseStateKey: null,
                activeCardWorkspaceExerciseKey: "python-v2:module-1:section:topic:exercise:q9",
                fallbackCardScopeKey: "card-scope:general",
            }),
        ).toBe("python-v2:module-1:section:topic:exercise:q9");
    });

    it("falls back to the card scope when no exercise runtime exists yet", () => {
        expect(
            resolveActiveToolScopeKey({
                activeExerciseStateKey: null,
                activeCardWorkspaceExerciseKey: null,
                fallbackCardScopeKey: "card-scope:general",
            }),
        ).toBe("card-scope:general");
    });
});
