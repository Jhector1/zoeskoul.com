"use client";

import React, {
    createContext,
    useContext,
    type ComponentType,
    type ReactNode,
} from "react";

export type ExercisePromptValue = {
    title?: unknown;
    prompt?: unknown;
    readonly [key: string]: unknown;
};

export type ExercisePromptRenderer = ComponentType<{
    exercise: ExercisePromptValue;
}>;

const ExercisePromptRendererContext =
    createContext<ExercisePromptRenderer | null>(null);

export function ExercisePromptProvider({
    renderer,
    children,
}: {
    renderer: ExercisePromptRenderer;
    children: ReactNode;
}) {
    return (
        <ExercisePromptRendererContext.Provider value={renderer}>
            {children}
        </ExercisePromptRendererContext.Provider>
    );
}

export function ExercisePrompt({
    exercise,
}: {
    exercise: ExercisePromptValue;
}) {
    const Renderer = useContext(ExercisePromptRendererContext);

    if (!Renderer) {
        throw new Error(
            "ExercisePrompt must be rendered inside ExercisePromptProvider",
        );
    }

    return <Renderer exercise={exercise} />;
}
