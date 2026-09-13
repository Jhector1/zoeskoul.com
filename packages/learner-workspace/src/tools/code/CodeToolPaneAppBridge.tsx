"use client";

import {
    createContext,
    useContext,
    type ComponentType,
    type ReactNode,
} from "react";

export type CodeToolPaneAppBridgeValue = {
    CodeFeedbackCallout: ComponentType<any>;
    FullIDE: ComponentType<any>;
    preloadEditorAssets: () => Promise<void>;
    reviewTools: any;
    t: (...args: any[]) => any;
};

const CodeToolPaneAppBridgeContext =
    createContext<CodeToolPaneAppBridgeValue | null>(null);

export function CodeToolPaneAppBridgeProvider(props: {
    value: CodeToolPaneAppBridgeValue;
    children: ReactNode;
}) {
    return (
        <CodeToolPaneAppBridgeContext.Provider value={props.value}>
            {props.children}
        </CodeToolPaneAppBridgeContext.Provider>
    );
}

export function useCodeToolPaneAppBridge(): CodeToolPaneAppBridgeValue {
    const value = useContext(CodeToolPaneAppBridgeContext);
    if (!value) {
        throw new Error(
            "CodeToolPane must be rendered inside CodeToolPaneAppBridgeProvider",
        );
    }
    return value;
}
