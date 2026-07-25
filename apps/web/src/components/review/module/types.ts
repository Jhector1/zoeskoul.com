import type { ReactNode } from "react";
import type { ReviewModule } from "@/lib/subjects/types";
import type { FlowNavigationConfig } from "@/components/review/navigation/FlowNavigator";
import type { ReviewWorkspaceCapabilities } from "./workspaceCapabilities";

export type ReviewModulePageProps = {
    mod: ReviewModule;
    canUnlockAll?: boolean;
    footerInsetPx?: number;
    navigationMode?: FlowNavigationConfig;
    routePrefix?: string | null;
    supplementalHeader?: ReactNode;
    tutoringSession?: {
        id: string;
        canEdit: boolean;
        canEditBoard?: boolean;
        title?: string;
        viewLabel?: string;
        workspaceView?: "master" | "reference" | "mine" | "learner";
        learnerId?: string | null;
        status?: "draft" | "live" | "shared" | "archived";
        publishedVersion?: number;
        workspaceRevision?: number;
        followTutor?: boolean;
        capabilities?: ReviewWorkspaceCapabilities;
    } | null;
};

export type ModuleProgressVm = {
    total: number;
    done: number;
    pct: number;
};

export type HeaderGamificationVm = {
    totalXp: number;
    level: number;
    currentStreak: number;
    levelProgressPct: number;
};

export type AssignmentVm = {
    label: string;
    sublabel?: string;
    rightPct?: number | null;
    missedPct?: number | null;
};