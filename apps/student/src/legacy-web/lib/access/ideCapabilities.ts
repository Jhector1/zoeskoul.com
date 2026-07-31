import { FeatureKey } from "@zoeskoul/db";
import type { AccessSnapshot } from "./accessSnapshot";

export type IdeCapability =
    | "multi_file"
    | "save_cloud"
    | "create_project"
    | "project_revisions"
    | "project_scope_module"
    | "project_scope_assignment"
    | "project_share";

export type IdeCapabilities = {
    hasUser: boolean;
    isSubscribed: boolean;

    canUseMultiFile: boolean;
    canSaveCloud: boolean;
    canCreateProjects: boolean;
    canUseProjectRevisions: boolean;
    canUseModuleProjects: boolean;
    canUseAssignmentProjects: boolean;
    canShareProjects: boolean;

    maxProjects: number | null;
};

function hasFeature(snapshot: AccessSnapshot, key: FeatureKey) {
    return snapshot.featureAccess.has(key);
}

export function resolveIdeCapabilities(snapshot: AccessSnapshot): IdeCapabilities {
    const isSubscribed = snapshot.isSubscribed;

    const canUseMultiFile =
        snapshot.hasUser ||
        isSubscribed ||
        hasFeature(snapshot, FeatureKey.ide_multi_file);

    const canSaveCloud =
        isSubscribed ||
        hasFeature(snapshot, FeatureKey.ide_save_cloud);

    const canCreateProjects =
        canSaveCloud ||
        hasFeature(snapshot, FeatureKey.ide_project_create);

    const canUseProjectRevisions =
        isSubscribed ||
        hasFeature(snapshot, FeatureKey.ide_project_revisions);

    const canUseModuleProjects =
        isSubscribed ||
        hasFeature(snapshot, FeatureKey.ide_project_scope_module);

    const canUseAssignmentProjects =
        isSubscribed ||
        hasFeature(snapshot, FeatureKey.ide_project_scope_assignment);

    const canShareProjects =
        isSubscribed ||
        hasFeature(snapshot, FeatureKey.ide_project_share);

    const maxProjects =
        isSubscribed || hasFeature(snapshot, FeatureKey.ide_project_unlimited)
            ? null
            : 0;

    return {
        hasUser: snapshot.hasUser,
        isSubscribed,

        canUseMultiFile,
        canSaveCloud,
        canCreateProjects,
        canUseProjectRevisions,
        canUseModuleProjects,
        canUseAssignmentProjects,
        canShareProjects,

        maxProjects,
    };
}

export function hasIdeCapability(
    caps: IdeCapabilities,
    capability: IdeCapability,
): boolean {
    switch (capability) {
        case "multi_file":
            return caps.canUseMultiFile;
        case "save_cloud":
            return caps.canSaveCloud;
        case "create_project":
            return caps.canCreateProjects;
        case "project_revisions":
            return caps.canUseProjectRevisions;
        case "project_scope_module":
            return caps.canUseModuleProjects;
        case "project_scope_assignment":
            return caps.canUseAssignmentProjects;
        case "project_share":
            return caps.canShareProjects;
        default:
            return false;
    }
}
