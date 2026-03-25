// src/lib/subjects/_core/defineModule.ts
import type { SectionBundle } from "./defineSection";

export type ModuleMeta = {
    outcomes?: readonly string[];
    why?: readonly string[];
    prereqs?: readonly string[];
    videoUrl?: string | null;
    estimatedMinutes?: number;
};

export type ModuleInput = {
    slug: string;
    subjectSlug: string;
    order: number;
    title: string;
    description?: string | null;
    weekStart?: number | null;
    weekEnd?: number | null;
    meta?: ModuleMeta;

    accessOverride?: "inherit" | "free" | "paid";
    entitlementKey?: string | null;
};

export type ModuleBundle = {
    module: ModuleInput;
    prefix: string;
    genKey: string;
    sections: readonly SectionBundle[];
};

export function defineModule<const T extends ModuleBundle>(input: T): T {
    return input;
}