import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import {
  resolveZoeBuildPublishedSiteOrigin,
} from "@/lib/build/publishOrigins";

import {
  ZOEBUILD_SELF_HOSTED_PROVIDER,
  ZOEBUILD_STATIC_ASSETS_KIND,
} from "@/lib/build/publishedArtifactIdentity";

export type ZoeBuildPublishedDeploymentSnapshot =
  Readonly<{
    deploymentId: string;
    sourceVersion: number;
    artifactHash: string;
    deployedAt: string;
    publicUrl: string;
  }>;

export function buildZoeBuildPublishedSiteUrl(
  publicOrigin: string,
  buildProjectId: string,
): string {
  const projectId =
    buildProjectId.trim();

  if (!projectId) {
    throw new Error(
      "A ZoeBuild project id is required to build a published-site URL.",
    );
  }

  return new URL(
    `/sites/${encodeURIComponent(projectId)}/`,
    `${publicOrigin}/`,
  ).toString();
}

/**
 * Reopen hydration only.
 *
 * This reads the latest immutable ready deployment.
 * It never publishes, builds, mutates source, or invokes AI.
 */
export async function readLatestOwnedPublishedDeployment(
  client: PrismaClient,
  input: Readonly<{
    ownerId: string;
    buildProjectId: string;
  }>,
): Promise<ZoeBuildPublishedDeploymentSnapshot | null> {
  const ownerId =
    input.ownerId.trim();

  const buildProjectId =
    input.buildProjectId.trim();

  if (
    !ownerId ||
    !buildProjectId
  ) {
    return null;
  }

  const deployment =
    await client
      .buildDeployment
      .findFirst({
        where: {
          buildProjectId,

          environment:
            "production",

          kind:
            ZOEBUILD_STATIC_ASSETS_KIND,

          provider:
            ZOEBUILD_SELF_HOSTED_PROVIDER,

          status:
            "ready",

          // No legacy raw-source deployments are publishable.
          buildArtifactId: { not: null },

          buildProject: {
            status: {
              not:
                "archived",
            },

            codeProject: {
              ownerId,
              archivedAt:
                null,
            },
          },
        },

        orderBy: [
          {
            deployedAt:
              "desc",
          },

          {
            createdAt:
              "desc",
          },
        ],

        select: {
          id: true,

          sourceVersion:
            true,

          artifactHash:
            true,

          deployedAt:
            true,
        },
      });

  if (!deployment) {
    return null;
  }

  if (
    !deployment.artifactHash ||
    !deployment.deployedAt
  ) {
    throw new Error(
      "Ready ZoeBuild deployment is missing immutable publication metadata.",
    );
  }

  return {
    deploymentId:
      deployment.id,

    sourceVersion:
      deployment.sourceVersion,

    artifactHash:
      deployment.artifactHash,

    deployedAt:
      deployment.deployedAt.toISOString(),

    publicUrl:
      buildZoeBuildPublishedSiteUrl(
        resolveZoeBuildPublishedSiteOrigin(),
        buildProjectId,
      ),
  };
}
