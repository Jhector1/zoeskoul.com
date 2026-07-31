import { describe, expect, it } from "vitest";
import {
    DEFAULT_TOPIC_TOOL_SCOPE_KEY,
    resolveActiveToolScopeKey,
} from "./activeToolScopeKey";

describe("resolveActiveToolScopeKey", () => {
    it("prefers the route-owned exercise when present", () => {
        expect(
            resolveActiveToolScopeKey({
                activeExerciseStateKey: "python-v2:module-1:section:topic:exercise:q9",
                activeCardWorkspaceExerciseKey: "python-v2:module-1:section:topic:exercise:q10",
            }),
        ).toBe("python-v2:module-1:section:topic:exercise:q9");
    });

    it("uses the active card runtime exercise for embedded try-it cards", () => {
        expect(
            resolveActiveToolScopeKey({
                activeExerciseStateKey: null,
                activeCardWorkspaceExerciseKey: "python-v2:module-1:section:topic:exercise:q9",
            }),
        ).toBe("python-v2:module-1:section:topic:exercise:q9");
    });

    it("uses a card-scoped fallback for an ordinary sketch card", () => {
        expect(
            resolveActiveToolScopeKey({
                activeExerciseStateKey: null,
                activeCardWorkspaceExerciseKey: null,
                fallbackWorkspaceScopeKey:
                    "card:python-v2:module-1:section-1:topic-1:sketch-1",
            }),
        ).toBe("card:python-v2:module-1:section-1:topic-1:sketch-1");
    });

    it("keeps different ordinary cards on different fallback scopes", () => {
        const first = resolveActiveToolScopeKey({
            fallbackWorkspaceScopeKey:
                "card:python-v2:module-1:section-1:topic-1:sketch-1",
        });
        const second = resolveActiveToolScopeKey({
            fallbackWorkspaceScopeKey:
                "card:python-v2:module-1:section-1:topic-1:sketch-2",
        });

        expect(first).not.toBe(second);
    });

    it("uses the topic fallback only when no card target is available", () => {
        expect(
            resolveActiveToolScopeKey({
                activeExerciseStateKey: null,
                activeCardWorkspaceExerciseKey: null,
            }),
        ).toBe(DEFAULT_TOPIC_TOOL_SCOPE_KEY);
    });
});
