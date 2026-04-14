import type { ReviewModule } from "@/lib/subjects/types";
import type { FlowNavigationConfig } from "@/components/review/navigation/FlowNavigator";

export type ReviewModulePageProps = {
    mod: ReviewModule;
    onModuleCompleteChange?: (done: boolean) => void;
    canUnlockAll?: boolean;
    footerInsetPx?: number;
    navigationMode?: FlowNavigationConfig;
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