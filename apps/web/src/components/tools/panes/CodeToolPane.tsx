"use client";

import React from "react";
import CodeRunner from "@/components/code/runner/CodeRunner";
import { CodeLanguage } from "@/lib/practice/types";
import { useElementSize } from "@/components/tools/hooks/useElementSize";

export default function CodeToolPane(props: {
    height: number;
    toolLang: CodeLanguage;
    toolCode: string;
    toolStdin: string;
    onChangeCode: (c: string) => void;
    onChangeStdin: (s: string) => void;
    onBeforeRun?: () => void | Promise<void>;
}) {
    const {
        toolLang,
        toolCode,
        toolStdin,
        onChangeCode,
        onChangeStdin,
        onBeforeRun,
    } = props;

    const { ref, size } = useElementSize<HTMLDivElement>();
    const runnerH = Math.max(320, size.h);

    return (
        <div ref={ref} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <CodeRunner
                frame="plain"
                title="Run code"
                showHint={false}
                height={runnerH - 50}
                showTerminalDockToggle
                showEditorThemeToggle
                fixedLanguage={toolLang}
                showLanguagePicker={false}
                code={toolCode}
                onChangeCode={onChangeCode}
                // stdin={toolStdin}
                // onChangeStdin={onChangeStdin}
                onBeforeRun={onBeforeRun}
            />
        </div>
    );
}