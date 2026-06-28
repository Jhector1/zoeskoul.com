"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ThemeProvider } from "next-themes";
import { GlobalNavigationProgress } from "@/components/navigation/GlobalNavigationProgress";

function isBenignMonacoCanceledError(reason: unknown) {
    const message = String((reason as any)?.message ?? reason ?? "");
    const name = String((reason as any)?.name ?? "");
    const stack = String((reason as any)?.stack ?? "");

    if (message !== "Canceled" && name !== "Canceled") {
        return false;
    }

    return (
        stack.includes("monaco-editor") ||
        stack.includes("editor.api") ||
        stack.includes("vs/editor") ||
        message === "Canceled"
    );
}

function MonacoCanceledErrorGuard() {
    React.useEffect(() => {
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (isBenignMonacoCanceledError(event.reason)) {
                event.preventDefault();
            }
        };

        const handleError = (event: ErrorEvent) => {
            if (isBenignMonacoCanceledError(event.error ?? event.message)) {
                event.preventDefault();
            }
        };

        window.addEventListener("unhandledrejection", handleUnhandledRejection);
        window.addEventListener("error", handleError);

        return () => {
            window.removeEventListener("unhandledrejection", handleUnhandledRejection);
            window.removeEventListener("error", handleError);
        };
    }, []);

    return null;
}

export default function Providers({
                                      children,
                                      session,
                                  }: {
    children: React.ReactNode;
    session?: Session | null;
}) {
    return (
        <SessionProvider session={session}>
            <ThemeProvider
                attribute="class"
                value={{ dark: "dark", light: "light" }}
                defaultTheme="system"
                enableSystem
                enableColorScheme={false}
                disableTransitionOnChange
            >
                <MonacoCanceledErrorGuard />
                <GlobalNavigationProgress />
                {children}
            </ThemeProvider>
        </SessionProvider>
    );
}