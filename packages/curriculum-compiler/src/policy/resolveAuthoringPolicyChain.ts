import fs from "node:fs/promises";
import type {
    AuthoringPolicyLayer,
    ResolvedAuthoringPolicy,
} from "@zoeskoul/curriculum-contracts";
import {
    getAuthoringRoot,
    getAuthoringCourseValidationPath,
    getAuthoringSharedGenerationPolicyPath,
    getAuthoringSharedValidationPolicyPath,
    getAuthoringSubjectProfilePath,
    getAuthoringSubjectSharedValidationPath,
    getAuthoringSubjectWorkspacePolicyPath,
} from "@zoeskoul/curriculum-core";

type ResolveAuthoringPolicyChainArgs = {
    authoringRoot?: string;
    subjectSlug: string;
    courseSlug?: string;
    includeProjectPolicy?: boolean;
};

type PolicySource = {
    label: string;
    path: string;
};

async function readJsonIfExists(filePath: string): Promise<unknown | null> {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw);
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

function maybeFromAuthoringRoot(authoringRoot: string | undefined, canonicalPath: string) {
    if (!authoringRoot) return canonicalPath;
    const canonicalRoot = getAuthoringRoot();
    return canonicalPath.startsWith(canonicalRoot)
        ? `${authoringRoot}${canonicalPath.slice(canonicalRoot.length)}`
        : canonicalPath;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStable(values: unknown[]) {
    const seen = new Set<string>();
    const out: unknown[] = [];

    for (const value of values) {
        const key =
            typeof value === "string"
                ? `string:${value}`
                : JSON.stringify(value);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }

    return out;
}

function normalizeLayer(value: unknown): AuthoringPolicyLayer {
    if (!isObject(value)) return {};
    return value as AuthoringPolicyLayer;
}

function hasOverrideForPath(
    overrides: AuthoringPolicyLayer["overrides"],
    fieldPath: string,
) {
    return Array.isArray(overrides)
        ? overrides.some((entry) => entry?.path === fieldPath && typeof entry.reason === "string")
        : false;
}

function mergeLayer(args: {
    base: AuthoringPolicyLayer;
    incoming: AuthoringPolicyLayer;
    warnings: string[];
    sourceLabel: string;
    pathPrefix?: string;
}) {
    const { base, incoming, warnings, sourceLabel, pathPrefix = "" } = args;
    const output: Record<string, unknown> = structuredClone(base);

    for (const [key, value] of Object.entries(incoming)) {
        if (value === undefined) continue;
        const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        const existing = output[key];

        if (Array.isArray(value)) {
            const merged = Array.isArray(existing)
                ? uniqueStable([...existing, ...value])
                : uniqueStable(value);
            output[key] = merged;

            if (
                Array.isArray(existing) &&
                (key === "forbiddenActions" || key === "avoidTerms") &&
                existing.some((entry) => value.includes(entry)) &&
                sourceLabel === "course validation"
            ) {
                warnings.push(
                    `${sourceLabel}: duplicates existing ${fieldPath}; keep shared or subject policy as the source of truth`,
                );
            }
            continue;
        }

        if (isObject(value)) {
            output[key] = mergeLayer({
                base: isObject(existing) ? (existing as AuthoringPolicyLayer) : {},
                incoming: value as AuthoringPolicyLayer,
                warnings,
                sourceLabel,
                pathPrefix: fieldPath,
            });
            continue;
        }

        if (
            key !== "policyId" &&
            existing !== undefined &&
            existing !== value &&
            sourceLabel === "course validation" &&
            !hasOverrideForPath(incoming.overrides, fieldPath)
        ) {
            warnings.push(
                `${sourceLabel}: overrides ${fieldPath} without explicit override reason`,
            );
        }

        output[key] = value;
    }

    return output as AuthoringPolicyLayer;
}

function toGenerationPolicy(policy: AuthoringPolicyLayer) {
    return {
        studentActionStyle: "browser-workspace",
        forbidUnavailableWorkspaceActions: true,
        avoidTerms: uniqueStable([
            ...(policy.forbiddenActions ?? []),
            ...(policy.avoidTerms ?? []),
        ]) as string[],
        preferredTerms: policy.preferredTerms ?? {},
        notes: uniqueStable([
            ...(policy.learnerInstructions ?? []),
            ...(policy.notes ?? []),
        ]) as string[],
    };
}

export async function resolveAuthoringPolicyChain(
    args: ResolveAuthoringPolicyChainArgs,
): Promise<ResolvedAuthoringPolicy> {
    const sources: PolicySource[] = [
        {
            label: "shared generation platform",
            path: maybeFromAuthoringRoot(
                args.authoringRoot,
                getAuthoringSharedGenerationPolicyPath("platform"),
            ),
        },
        {
            label: "shared generation browser workspace",
            path: maybeFromAuthoringRoot(
                args.authoringRoot,
                getAuthoringSharedGenerationPolicyPath("browser-workspace"),
            ),
        },
        {
            label: "shared generation code input",
            path: maybeFromAuthoringRoot(
                args.authoringRoot,
                getAuthoringSharedGenerationPolicyPath("code-input"),
            ),
        },
        ...(args.includeProjectPolicy
            ? [{
                label: "shared generation project",
                path: maybeFromAuthoringRoot(
                    args.authoringRoot,
                    getAuthoringSharedGenerationPolicyPath("project"),
                ),
            }]
            : []),
        {
            label: "shared validation course structure",
            path: maybeFromAuthoringRoot(
                args.authoringRoot,
                getAuthoringSharedValidationPolicyPath("course-structure"),
            ),
        },
        {
            label: "shared validation versioning",
            path: maybeFromAuthoringRoot(
                args.authoringRoot,
                getAuthoringSharedValidationPolicyPath("versioning"),
            ),
        },
        {
            label: "shared validation workspace language",
            path: maybeFromAuthoringRoot(
                args.authoringRoot,
                getAuthoringSharedValidationPolicyPath("workspace-language"),
            ),
        },
        {
            label: "subject profile",
            path: maybeFromAuthoringRoot(
                args.authoringRoot,
                getAuthoringSubjectProfilePath(args.subjectSlug),
            ),
        },
        {
            label: "subject workspace",
            path: maybeFromAuthoringRoot(
                args.authoringRoot,
                getAuthoringSubjectWorkspacePolicyPath(args.subjectSlug),
            ),
        },
        {
            label: "subject validation",
            path: maybeFromAuthoringRoot(
                args.authoringRoot,
                getAuthoringSubjectSharedValidationPath(args.subjectSlug),
            ),
        },
        ...(args.courseSlug
            ? [{
                label: "course validation",
                path: maybeFromAuthoringRoot(
                    args.authoringRoot,
                    getAuthoringCourseValidationPath(args.subjectSlug, args.courseSlug),
                ),
            }]
            : []),
    ];

    const warnings: string[] = [];
    let merged: AuthoringPolicyLayer = {};
    const loadedSources: string[] = [];

    for (const source of sources) {
        const json = await readJsonIfExists(source.path);
        if (!json) continue;
        merged = mergeLayer({
            base: merged,
            incoming: normalizeLayer(json),
            warnings,
            sourceLabel: source.label,
        });
        loadedSources.push(source.path);
    }

    return {
        ...merged,
        sources: loadedSources,
        warnings: uniqueStable(warnings) as string[],
    };
}

export function applyResolvedPolicyToBlueprint<T extends Record<string, unknown>>(
    blueprint: T,
    policy: ResolvedAuthoringPolicy,
) {
    return {
        ...blueprint,
        workspaceProfileId:
            (blueprint.workspaceProfileId as string | undefined) ??
            policy.workspaceProfileId,
        workspacePolicyId:
            (blueprint.workspacePolicyId as string | undefined) ??
            policy.workspacePolicyId,
        courseGenerationPolicy: mergeLayer({
            base: isObject(blueprint.courseGenerationPolicy)
                ? (blueprint.courseGenerationPolicy as AuthoringPolicyLayer)
                : {},
            incoming: toGenerationPolicy(policy),
            warnings: [],
            sourceLabel: "resolved authoring policy",
        }),
    };
}
