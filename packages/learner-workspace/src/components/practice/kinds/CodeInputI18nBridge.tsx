"use client";

import React, { createContext, useContext } from "react";

export type CodeInputMessageKey =
    | "inputLabel"
    | "outputLabel"
    | "exampleTitle"
    | "expectedExampleMeta"
    | "expectedResultTitle"
    | "resultPreviewMeta"
    | "nullValue";

export type CodeInputUiKey =
    | "tools.title"
    | "tools.language"
    | "tools.bound"
    | "tools.notBound"
    | "tools.desc"
    | "tools.bindTitle"
    | "tools.boundAria"
    | "tools.openAria"
    | "tools.boundShort"
    | "tools.open"
    | "correctSolution";

export type CodeInputUiValues = Record<string, string | number | Date>;

export type CodeInputI18nValue = {
    t: (key: CodeInputMessageKey) => string;
    uiT: (
        key: CodeInputUiKey,
        values?: CodeInputUiValues,
        fallback?: string,
    ) => string;
    resolveText: (value: string | undefined) => string;
};

const CodeInputI18nContext = createContext<CodeInputI18nValue | null>(null);

export function CodeInputI18nProvider({
    value,
    children,
}: {
    value: CodeInputI18nValue;
    children: React.ReactNode;
}) {
    return (
        <CodeInputI18nContext.Provider value={value}>
            {children}
        </CodeInputI18nContext.Provider>
    );
}

export function useCodeInputI18n() {
    const value = useContext(CodeInputI18nContext);
    if (!value) {
        throw new Error("CodeInputI18nProvider is required");
    }
    return value;
}
