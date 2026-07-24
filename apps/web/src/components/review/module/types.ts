import type { ReviewModule } from "@/lib/subjects/types";
import type { FlowNavigationConfig } from "@/components/review/navigation/FlowNavigator";

export type ReviewModulePageProps = {
    mod: ReviewModule;
    canUnlockAll?: boolean;
    footerInsetPx?: number;
    navigationMode?: FlowNavigationConfig;
    routePrefix?: string | null;
    tutoringSession?: {
        id: string;
        canEdit: boolean;
        canEditBoard?: boolean;
        title?: string;
        viewLabel?: string;
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