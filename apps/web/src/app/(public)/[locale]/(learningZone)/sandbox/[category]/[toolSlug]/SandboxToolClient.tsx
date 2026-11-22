"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { admitUnifiedSandbox, selectUnifiedSandbox } from "@/components/sandbox/unifiedSandboxPilot";
import ProgrammingSandboxSkeleton from "@/components/sandbox/ProgrammingSandboxSkeleton";
import {
    buildProgrammingToolHref,
    PROGRAMMING_TOOL_ORDER,
    type SandboxToolEntry,
} from "@/lib/sandbox/toolRegistry";
import type { WorkspaceLanguage } from "@/lib/practice/types";

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

function SandboxToolContent({
                                              locale,
                                              entry,
                                              access,
                                              unifiedLinuxPilot = false,
                                          }: {
    locale: string;
    entry: SandboxToolEntry;
    access: SandboxAccess;
    unifiedLinuxPilot?: boolean;
}) {
    if (entry.kind === "programming") {
        const routeLanguageMap: Partial<Record<WorkspaceLanguage, string>> =
            Object.fromEntries(
                PROGRAMMING_TOOL_ORDER.map((tool) => [
                    tool,
                    buildProgrammingToolHref(locale, tool),
                ]),
            ) as Partial<Record<WorkspaceLanguage, string>>;

        const shellHref = `/${locale}/sandbox/programming/shell`;
        const localizedLessonHref = entry.lessonPath
            ? `/${locale}${entry.lessonPath}`
            : undefined;

        return (

            <ProgrammingSandbox
                initialLanguage={(entry.initialLanguage ?? "python") as WorkspaceLanguage}
                initialSurfaceMode={entry.toolSlug === "shell" ? "shell" : "code"}
                unifiedLinuxPilot={unifiedLinuxPilot}
                shellHref={shellHref}
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

type SandboxProps = {locale: string; entry: SandboxToolEntry; access: SandboxAccess};

function PilotUnavailable({retry}: {retry?: () => void}) {
    return <div className="p-6 space-y-3" role="alert">
        <h1 className="font-semibold">Unified Linux development workspace unavailable</h1>
        <p>Use the dedicated signed-in development account with multi-file access and start the private pilot first. This page did not open a legacy terminal or project.</p>
        {retry && <button type="button" className="rounded border px-3 py-1" onClick={retry}>Retry admission</button>}
    </div>;
}

function AdmittedSandbox(props: SandboxProps) {
    const [state, setState] = React.useState<"checking" | "allowed" | "denied">("checking");
    const [attempt, setAttempt] = React.useState(0);
    React.useEffect(() => {
        const controller = new AbortController();
        let active = true;
        const timer = window.setTimeout(() => { if (active) {setState("denied"); controller.abort();} }, 15000);
        void admitUnifiedSandbox(window.location.origin, controller.signal).then(ok => {
            if (active && !controller.signal.aborted) { window.clearTimeout(timer); setState(ok ? "allowed" : "denied"); }
        });
        return () => { active = false; window.clearTimeout(timer); controller.abort(); };
    }, [attempt]);
    if (state === "checking") return <div className="p-6" role="status">Checking private Linux workspace admission…</div>;
    if (state === "denied") return <PilotUnavailable retry={() => {setState("checking"); setAttempt(n => n + 1);}} />;
    return <SandboxToolContent {...props} unifiedLinuxPilot />;
}

function SandboxRoute(props: SandboxProps) {
    const params = useSearchParams();
    if (!params) return <ProgrammingSandboxSkeleton />;
    const selection = selectUnifiedSandbox({values: params.getAll("unifiedLinux"),
        nodeEnv: process.env.NODE_ENV, kind: props.entry.kind, toolSlug: props.entry.toolSlug,
        hasUser: props.access.hasUser, canUseMultiFile: props.access.canUseMultiFile});
    if (selection === "denied" || (selection === "unified" && (props.entry.kind !== "programming" || (props.entry.initialLanguage ?? "python") !== "python"))) return <PilotUnavailable />;
    if (selection === "unified") return <AdmittedSandbox {...props} />;
    return <SandboxToolContent {...props} />;
}

export default function SandboxToolClient(props: SandboxProps) {
    if (props.entry.kind !== "programming" || props.entry.toolSlug !== "python") {
        return <SandboxToolContent {...props} />;
    }
    return <React.Suspense fallback={<div className="fixed inset-0 z-[100]"><ProgrammingSandboxSkeleton /></div>}>
        <SandboxRoute {...props} />
    </React.Suspense>;
}
