import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";

export function mergeManifestRuntimeDefaults(
    ...defaults: Array<ManifestRuntimeDefaults | null | undefined>
): ManifestRuntimeDefaults | null {
    let merged: ManifestRuntimeDefaults | null = null;

    for (const current of defaults) {
        if (!current) continue;

        if (!merged || merged.kind !== current.kind) {
            merged = { ...current };
            continue;
        }

        const previousFileActions = merged.fileActions ?? {};

        merged = {
            ...merged,
            ...current,
            ...(current.fileActions
                ? {
                    fileActions: {
                        ...previousFileActions,
                        ...current.fileActions,
                    },
                }
                : {}),
        };
    }

    return merged;
}
