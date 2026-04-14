// src/lib/subjects/_core/defineModule.ts
import type { ManifestRuntimeDefaults } from "./manifestTypes";
import type { SectionBundle } from "./defineSection";

export type ModuleMeta = {
    // legacy display fields
    outcomes?: readonly string[];
    why?: readonly string[];
    prereqs?: readonly string[];

    // canonical key fields
    outcomeKeys?: readonly string[];
    whyKeys?: readonly string[];
    prereqKeys?: readonly string[];

    videoUrl?: string | null;
    estimatedMinutes?: number;
};

export type ModuleInput = {
    slug: string;
    subjectSlug: string;
    order: number;

    // legacy display fields
    title: string;
    description?: string | null;

    // canonical i18n fields
    titleKey?: string;
    descriptionKey?: string | null;

    weekStart?: number | null;
    weekEnd?: number | null;
    meta?: ModuleMeta;

    runtimeDefaults?: ManifestRuntimeDefaults | null;

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