// src/components/code/runner/CodeRunnerBoundary.tsx
"use client";

import React from "react";

type Props = {
    children: React.ReactNode;
};

type State = {
    hasError: boolean;
    message?: string;
};

export default class CodeRunnerBoundary extends React.Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(error: any): State {
        return {
            hasError: true,
            message: error?.message ?? "Code runner crashed.",
        };
    }

    componentDidCatch(error: any, info: any) {
        console.error("[CodeRunnerBoundary]", error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="rounded-2xl border border-rose-300/30 bg-rose-50/60 p-4 text-sm text-rose-700 dark:border-rose-300/20 dark:bg-rose-950/20 dark:text-rose-200">
                    Code runner UI crashed: {this.state.message}
                </div>
            );
        }

        return this.props.children;
    }
}