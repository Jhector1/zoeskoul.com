"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import SharedCodeToolPane from "@zoeskoul/learner-workspace/tools/code/CodeToolPane";
import { CodeToolPaneAppBridgeProvider } from "@zoeskoul/learner-workspace/tools/code/CodeToolPaneAppBridge";
import CodeFeedbackCallout from "@/components/practice/kinds/CodeFeedbackCallout";
import { useReviewTools } from "@/components/review/module/context/ReviewToolsContext";

const FullIDE = dynamic(() => import("@/components/ide/fullide/FullIDE"), {
    ssr: false,
    loading: () => null,
});

let codeToolPaneEditorPreloadPromise: Promise<void> | null = null;

export function preloadCodeToolPaneEditorAssets() {
    if (codeToolPaneEditorPreloadPromise) {
        return codeToolPaneEditorPreloadPromise;
    }

    codeToolPaneEditorPreloadPromise = Promise.all([
        import("@/components/ide/fullide/FullIDE"),
        import("@monaco-editor/react"),
        import("monaco-editor"),
    ]).then(() => undefined);

    return codeToolPaneEditorPreloadPromise;
}

export * from "@zoeskoul/learner-workspace/tools/code/CodeToolPane";

export default function CodeToolPane(
    props: ComponentProps<typeof SharedCodeToolPane>,
) {
    const reviewTools = useReviewTools();
    const t = useTranslations("ide.tools.pane");

    return (
        <CodeToolPaneAppBridgeProvider
            value={{
                CodeFeedbackCallout,
                FullIDE,
                preloadEditorAssets: preloadCodeToolPaneEditorAssets,
                reviewTools,
                t,
            }}
        >
            <SharedCodeToolPane {...props} />
        </CodeToolPaneAppBridgeProvider>
    );
}
