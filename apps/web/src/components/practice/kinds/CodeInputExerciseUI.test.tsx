import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import CodeInputExerciseUI from "./CodeInputExerciseUI";

vi.mock("@/components/code/CodeRunner", () => ({
    default: () => <div data-testid="mock-code-runner" />,
}));

vi.mock("@/components/practice/kinds/KindHelper", () => ({
    ExercisePrompt: () => <div data-testid="mock-exercise-prompt" />,
}));

vi.mock("@/i18n/tagged", () => ({
    useTaggedT: () => ({
        t: (_key: string, _params?: unknown, fallback?: string) => fallback ?? "",
    }),
}));

vi.mock("@/components/review/module/runtime/reviewRuntimeStore", () => ({
    useReviewRuntimeStore: (selector: (state: { patchExercise: ReturnType<typeof vi.fn> }) => unknown) =>
        selector({ patchExercise: vi.fn() }),
}));

function baseProps(overrides: Record<string, unknown> = {}) {
    return {
        exercise: {
            kind: "code_input",
            id: "exercise-1",
            topic: "python.topic",
            difficulty: "easy",
            title: "Exercise",
            prompt: "Prompt",
            language: "python",
            starterCode: "print('hi')",
        },
        code: "print('hi')",
        stdin: "",
        language: "python",
        onChangeCode: vi.fn(),
        onChangeStdin: vi.fn(),
        onChangeLanguage: vi.fn(),
        disabled: false,
        ...overrides,
    } as any;
}

describe("CodeInputExerciseUI", () => {
    it("does not render the embedded CodeRunner in tools mode", () => {
        const html = renderToStaticMarkup(
            <CodeInputExerciseUI
                {...baseProps({
                    variant: "tools",
                    toolsBound: true,
                    onUseTools: vi.fn(),
                })}
            />,
        );

        expect(html).not.toContain('data-testid="mock-code-runner"');
    });

    it("renders the embedded CodeRunner in embedded mode", () => {
        const html = renderToStaticMarkup(
            <CodeInputExerciseUI
                {...baseProps({
                    variant: "embedded",
                })}
            />,
        );

        expect(html).toContain('data-testid="mock-code-runner"');
    });
});
