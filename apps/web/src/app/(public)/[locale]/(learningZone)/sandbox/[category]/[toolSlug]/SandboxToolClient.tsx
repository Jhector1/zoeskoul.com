"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import ProgrammingSandboxSkeleton from "@/components/sandbox/ProgrammingSandboxSkeleton";
import {
    buildProgrammingToolHref,
    PROGRAMMING_TOOL_ORDER,
    type SandboxToolEntry,
} from "@/lib/sandbox/toolRegistry";
import type { CodeLanguage } from "@/lib/practice/types";

export type SandboxAccess = {
    hasUser: boolean;
    canUseMultiFile: boolean;
    canSaveCloud: boolean;
    canCreateProjects: boolean;
};

const ProgrammingSandbox = dynamic(
    () => import("@/components/sandbox/ProgrammingSandbox"),
    {
        ssr: false,
        loading: () => (
            <div className="fixed inset-0 z-[100]">
                <ProgrammingSandboxSkeleton />
            </div>
        ),
    },
);

const LinearAlgebraSandbox = dynamic(
    () => import("@/components/sandbox/LinearAlgebraSandox"),
    {
        ssr: false,
        loading: () => <div className="ui-soft p-4">Loading Linear Algebra…</div>,
    },
);

export default function SandboxToolClient({
                                              locale,
                                              entry,
                                              access,
                                          }: {
    locale: string;
    entry: SandboxToolEntry;
    access: SandboxAccess;
}) {
    if (entry.kind === "programming") {
        const routeLanguageMap: Partial<Record<CodeLanguage, string>> =
            Object.fromEntries(
                PROGRAMMING_TOOL_ORDER.map((tool) => [
                    tool,
                    buildProgrammingToolHref(locale, tool),
                ]),
            );

        const localizedLessonHref = `/${locale}${entry.lessonPath}`;

        return (
            <ProgrammingSandbox
                initialLanguage={entry.initialLanguage}
                toolSlug={entry.toolSlug}
                title={entry.title}
                routeLanguageMap={routeLanguageMap}
                lessonHref={localizedLessonHref}
                lessonLabel="Lesson"
                access={access}
            />
        );
    }

    if (entry.kind === "math") {
        return <LinearAlgebraSandbox />;
    }

    return <div className="ui-soft p-4">Unknown Sandbox</div>;
}