import { buildZoeBuildWebAuthenticateUrl } from "@/lib/webAuthHandoff";
import {
  notFound,
  redirect,
} from "next/navigation";

import {
  getBuildProjectCommand,
} from "@zoeskoul/build-application";

import {
  loadCurrentBuildAccessSnapshot,
} from "@/lib/build/currentBuildAccess";
import {
  createPrismaBuildProjectReader,
} from "@/lib/build/readBuildProjects";
import {
  readLatestOwnedPublishedDeployment,
} from "@/lib/build/publishedDeploymentStatus";
import {
  prisma,
} from "@zoeskoul/platform-server/prisma";

import ProjectBuilderShell from "./ProjectBuilderShell";
import { canHydratePrivatePublishing } from "@/lib/build/privatePublishHydration";
import { hasReactCommerceCapability } from "@/lib/build/reactCommerceCapability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ZoeBuildWorkspacePage({
  params,
}: {
  params: Promise<{
    locale: string;
    buildProjectId: string;
  }>;
}) {
  const {
    locale,
    buildProjectId,
  } = await params;

  const access =
    await loadCurrentBuildAccessSnapshot();

  if (!access.userId) {
    const callbackUrl =
      `/${locale}/projects/${encodeURIComponent(buildProjectId)}`;

    redirect(
      buildZoeBuildWebAuthenticateUrl({
          callbackUrl,
          locale,
        }),
    );
  }

  const project =
    await getBuildProjectCommand({
      access,
      buildProjectId,
      reader:
        createPrismaBuildProjectReader(
          prisma,
        ),
    });

  if (!project) notFound();

  const initialDeployment =
    await readLatestOwnedPublishedDeployment(
      prisma,
      {
        ownerId:
          access.userId,

        buildProjectId:
          project.buildProjectId,
      },
    );

  return (
    <ProjectBuilderShell
      locale={locale}
      project={{
        buildProjectId:
          project.buildProjectId,
        codeProjectId:
          project.codeProjectId,
        title: project.title,
        description:
          project.description,
        status: project.status,
        stackId: project.stackId,
        sourceVersion:
          project.sourceVersion,
        language: project.language,
        workspace: project.workspace,
      }}
      commerceEnabled={hasReactCommerceCapability(project)}
      privateHydrationAllowed={canHydratePrivatePublishing(project,access.userId) || (process.env.NODE_ENV === "development" && process.env.VERCEL_ENV !== "production" && process.env.ZOEBUILD_PUBLISH_ENABLED === "0" && process.env.ZOEBUILD_HOSTED_PUBLISH_DEV === "1" && process.env.ZOEBUILD_HOSTED_FENCED_DEV === "1" && project.buildProjectId === "cmwvhcusk0002u0dlwhxh9uh2" && process.env.ZOEBUILD_HOSTED_FENCED_DEV_PROJECT === project.buildProjectId && !!access.userId && access.userId === process.env.ZOEBUILD_HOSTED_PUBLISH_DEV_OWNER) || (await import("@/lib/build/hostedProductionPolicy")).productionHostedUiAllowed(project.buildProjectId,access.userId,project.stackId,process.env)}
      initialDeployment={initialDeployment}
    />
  );
}
