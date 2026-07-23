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

    it("reuses one default workspace across ordinary cards in a topic", () => {
        expect(
            resolveActiveToolScopeKey({
                activeExerciseStateKey: null,
                activeCardWorkspaceExerciseKey: null,
            }),
        ).toBe(DEFAULT_TOPIC_TOOL_SCOPE_KEY);
    });

    it("allows a caller to provide a narrower shared fallback scope", () => {
        expect(
            resolveActiveToolScopeKey({
                activeExerciseStateKey: null,
                activeCardWorkspaceExerciseKey: null,
                fallbackWorkspaceScopeKey: "topic-tool:module-review",
            }),
        ).toBe("topic-tool:module-review");
    });
});
