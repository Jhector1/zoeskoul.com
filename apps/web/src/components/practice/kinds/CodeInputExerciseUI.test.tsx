import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { learnerUiFlags } from "@/lib/config/learnerUiFlags";
import CodeInputExerciseUI from "./CodeInputExerciseUI";

vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/code/CodeRunner", () => ({
    default: (props: { showStdinEditor?: boolean; height?: number | "auto" }) => (
        <div
            data-testid="mock-code-runner"
            data-show-stdin={String(Boolean(props.showStdinEditor))}
            data-height={String(props.height ?? "")}
        />
    ),
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

    it("hides the Tools launch card when compact learner UI is disabled", () => {
        const original = learnerUiFlags.compactLearnerUi;
        (learnerUiFlags as any).compactLearnerUi = false;

        try {
            const html = renderToStaticMarkup(
                <CodeInputExerciseUI
                    {...baseProps({
                        variant: "tools",
                        toolsBound: false,
                        onUseTools: vi.fn(),
                    })}
                />,
            );

            expect(html).not.toContain('data-testid="code-input-tools-launch-card"');
        } finally {
            (learnerUiFlags as any).compactLearnerUi = original;
        }
    });

    it("shows the Tools launch card only for compact learner UI while unbound", () => {
        const original = learnerUiFlags.compactLearnerUi;
        (learnerUiFlags as any).compactLearnerUi = true;

        try {
            const html = renderToStaticMarkup(
                <CodeInputExerciseUI
                    {...baseProps({
                        variant: "tools",
                        toolsBound: false,
                        onUseTools: vi.fn(),
                    })}
                />,
            );

            expect(html).toContain('data-testid="code-input-tools-launch-card"');
        } finally {
            (learnerUiFlags as any).compactLearnerUi = original;
        }
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
    it("keeps stdin enabled by default outside shared challenges", () => {
        const html = renderToStaticMarkup(
            <CodeInputExerciseUI {...baseProps({ variant: "embedded" })} />,
        );

        expect(html).toContain('data-show-stdin="true"');
        expect(html).toContain('data-height="420"');
    });

    it("honors an explicit false stdin setting for shared challenges", () => {
        const html = renderToStaticMarkup(
            <CodeInputExerciseUI
                {...baseProps({
                    variant: "embedded",
                    showStdinEditor: false,
                })}
            />,
        );

        expect(html).toContain('data-show-stdin="false"');
    });

    it("renders duplicate SQL column labels without duplicate React keys", () => {
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        try {
            const html = renderToStaticMarkup(
                <CodeInputExerciseUI
                    {...baseProps({
                        variant: "tools",
                        toolsBound: true,
                        expectedExample: {
                            kind: "sql_result",
                            columns: ["id", "id"],
                            rows: [[1, 2]],
                        },
                    })}
                />,
            );

            expect(html.match(/<th/g)).toHaveLength(2);
            expect(html).toContain(">1</td>");
            expect(html).toContain(">2</td>");
            expect(
                consoleError.mock.calls.flat().join(" "),
            ).not.toContain("same key");
        } finally {
            consoleError.mockRestore();
        }
    });

});
