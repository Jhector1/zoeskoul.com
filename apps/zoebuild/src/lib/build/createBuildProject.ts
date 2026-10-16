import "server-only";

import {
  createBuildProject,
  type BuildProjectPersistence,
  type BuildProjectSpecification,
  type CreateBuildProjectResult,
  type InitialBuildProjectPersistenceInput,
} from "@zoeskoul/build-application";
import {
  CodeProjectScopeKind,
  CodeProjectVisibility,
  Prisma,
  type PrismaClient,
} from "@zoeskoul/db";

import { prisma } from "@zoeskoul/platform-server/prisma";
import { saveCodeProjectInTransaction } from "@zoeskoul/platform-server/projects/saveCodeProject";

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildSourceSettings(input: InitialBuildProjectPersistenceInput) {
  return {
    zoeBuild: {
      schemaVersion: 1,
      stackId: input.stackId,
      templateId: input.templateId,
      dependencyLock: input.dependencyLock,
    },
  };
}

function buildSourceMeta(input: InitialBuildProjectPersistenceInput) {
  return {
    product: "zoebuild",
    buildSpecificationVersion: input.specification.version,
    stackId: input.stackId,
    templateId: input.templateId,
  };
}

/**
 * Prisma is an infrastructure adapter for the provider-neutral Build
 * application service. CodeProject + its initial revision + BuildProject +
 * an optional ZoeBuild Native CommerceStore are created in one transaction so
 * Build metadata can never point at a partially bootstrapped source project.
 */
export function createPrismaBuildProjectPersistence(
  client: PrismaClient,
): BuildProjectPersistence {
  return {
    async createInitialBuildProject(input) {
      return client.$transaction(async (tx) => {
        const saved = await saveCodeProjectInTransaction(tx, {
          ownerId: input.ownerId,
          title: input.title,
          description: input.description,
          language: input.language,
          workspace: toPrismaJson(input.workspace),
          settings: toPrismaJson(buildSourceSettings(input)),
          meta: toPrismaJson(buildSourceMeta(input)),
          entryPath: input.entryPath,
          activePath: input.activePath,
          visibility: CodeProjectVisibility.private,
          scope: { kind: CodeProjectScopeKind.personal },
          createRevision: true,
          revisionNote: "ZoeBuild initial template",
          createdById: input.ownerId,
        });

        if (saved.version !== 1) {
          throw new Error(
            `ZoeBuild bootstrap expected CodeProject version 1, received ${saved.version}.`,
          );
        }

        const buildProject = await tx.buildProject.create({
          data: {
            codeProjectId: saved.project.id,
            status: "draft",
            specVersion: input.specification.version,
            stackId: input.stackId,
            specification: toPrismaJson(input.specification),
          },
          select: { id: true },
        });

        if (
          input.specification.requirements.commerce &&
          input.specification.commerce?.provider === "zoebuild-native"
        ) {
          await tx.commerceStore.create({
            data: {
              buildProjectId: buildProject.id,
              status: "draft",
              name: input.title,
              defaultCurrency: "USD",
            },
            select: { id: true },
          });
        }

        return {
          codeProjectId: saved.project.id,
          buildProjectId: buildProject.id,
          sourceVersion: saved.version,
        };
      });
    },
  };
}

export async function createPersistedBuildProject(args: {
  ownerId: string;
  specification: BuildProjectSpecification;
  createdAt?: number;
  client?: PrismaClient;
}): Promise<CreateBuildProjectResult> {
  const client = args.client ?? prisma;

  return createBuildProject({
    ownerId: args.ownerId,
    specification: args.specification,
    createdAt: args.createdAt ?? Date.now(),
    persistence: createPrismaBuildProjectPersistence(client),
  });
}
