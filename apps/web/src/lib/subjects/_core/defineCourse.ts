// src/lib/subjects/_core/defineCourse.ts
import type { ModuleBundle } from "./defineModule";

export type SubjectStatus = "active" | "coming_soon" | "disabled";

export type SubjectMeta = {
    curriculum?: {
        plannedModuleCount?: number;
        isTerminalRelease?: boolean;
        moreComingMessage?: string;
        moreComingMessageKey?: string;
    };
    completionPolicy?: {
        requireAllPublishedModules?: boolean;
        rewardEnabledByDefault?: boolean;
        certificateEnabledByDefault?: boolean;
    };
    readonly [key: string]: unknown;
};

export type SubjectInput = {
    slug: string;
    order: number;
    title: string;
    description?: string | null;
    imagePublicId?: string | null;
    imageAlt?: string | null;
    meta?: SubjectMeta | null;

    accessPolicy?: "free" | "paid";
    status?: SubjectStatus;
    entitlementKey?: string | null;
};

export type CourseBundle = {
    subject: SubjectInput;
    modules: readonly ModuleBundle[];
};

export function defineCourse<const T extends CourseBundle>(input: T): T {
    return input;
}