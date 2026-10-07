import { describe, expect, it } from "vitest";

import { getOptionalClientMessage } from "./i18n/getOptionalClientMessage";
import {
    DEFAULT_TOPIC_TOOL_SCOPE_KEY,
    resolveActiveToolScopeKey,
} from "./hooks/activeToolScopeKey";
import {
    cardHasAuthoredExerciseSurface,
    shouldRightRailUseBoundExercise,
} from "./hooks/rightRailExerciseBinding";

describe("shared Review utilities", () => {
    it("keeps optional client-message fallback behavior", () => {
        const withMessage = Object.assign(
            (key: string) => `translated:${key}`,
            { has: (key: string) => key === "known" },
        );

        expect(
            getOptionalClientMessage(withMessage, "known", "fallback"),
        ).toBe("translated:known");
        expect(
            getOptionalClientMessage(withMessage, "missing", "fallback"),
        ).toBe("fallback");
    });

    it("preserves active tool scope precedence", () => {
        expect(
            resolveActiveToolScopeKey({
                activeExerciseStateKey: "exercise:1",
                activeCardWorkspaceExerciseKey: "card:1",
                fallbackWorkspaceScopeKey: "fallback:1",
            }),
        ).toBe("exercise:1");

        expect(resolveActiveToolScopeKey({})).toBe(
            DEFAULT_TOPIC_TOOL_SCOPE_KEY,
        );
    });

    it("preserves right-rail binding rules for quiz/project/authored surfaces", () => {
        expect(
            shouldRightRailUseBoundExercise({
                routeOwnsExercise: true,
                activeCard: null,
            }),
        ).toBe(true);

        expect(
            shouldRightRailUseBoundExercise({
                routeOwnsExercise: false,
                activeCard: {
                    type: "quiz",
                } as Parameters<
                    typeof shouldRightRailUseBoundExercise
                >[0]["activeCard"],
            }),
        ).toBe(false);

        expect(
            cardHasAuthoredExerciseSurface({
                type: "project",
                spec: { steps: [{}] },
            } as Parameters<typeof cardHasAuthoredExerciseSurface>[0]),
        ).toBe(true);
    });
});
