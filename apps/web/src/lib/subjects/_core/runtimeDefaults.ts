import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";

type ManifestRuntimeFileActions = NonNullable<
    ManifestRuntimeDefaults["fileActions"]
>;

function mergeFileActions(
    previous?: ManifestRuntimeDefaults["fileActions"] | null,
    current?: ManifestRuntimeDefaults["fileActions"] | null,
): ManifestRuntimeFileActions | undefined {
    if (!previous && !current) return undefined;

    return {
        ...(previous ?? {}),
        ...(current ?? {}),
    };
}

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

        const fileActions = mergeFileActions(
            merged.fileActions ?? null,
            current.fileActions ?? null,
        );

        merged = {
            ...merged,
            ...current,
            ...(fileActions ? { fileActions } : {}),
        };
    }

    return merged;
}