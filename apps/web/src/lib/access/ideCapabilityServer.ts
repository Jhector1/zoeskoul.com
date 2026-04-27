import "server-only";

import { FeatureKey } from "@zoeskoul/db";
import type { PrismaClient } from "@/lib/prisma";
import { getAccessSnapshot } from "./accessSnapshot";
import {
    hasIdeCapability,
    resolveIdeCapabilities,
    type IdeCapability,
} from "./ideCapabilities";
import { Actor } from "@/lib/practice/actor";

const IDE_FEATURE_KEYS: FeatureKey[] = [
    FeatureKey.ide_multi_file,
    FeatureKey.ide_save_cloud,
    FeatureKey.ide_project_create,
    FeatureKey.ide_project_revisions,
    FeatureKey.ide_project_scope_module,
    FeatureKey.ide_project_scope_assignment,
    FeatureKey.ide_project_share,
    FeatureKey.ide_project_unlimited,
];

export async function checkIdeCapability(
    prisma: PrismaClient,
    args: {
        actor: Actor;
        capability: IdeCapability;
    },
) {
    const snapshot = await getAccessSnapshot(prisma, args.actor, {
        featureKeys: IDE_FEATURE_KEYS,
    });

    const capabilities = resolveIdeCapabilities(snapshot);

    if (hasIdeCapability(capabilities, args.capability)) {
        return {
            ok: true as const,
            capabilities,
        };
    }

    return {
        ok: false as const,
        reason: snapshot.hasUser ? "requires_payment" : "requires_login",
        capabilities,
    };
}
