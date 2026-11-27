import { buildZoeBuildWebAuthenticateUrl } from "@/lib/webAuthHandoff";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/buildHandoff";
import { redirect } from "next/navigation";

import CreateBuildProjectClient from "@/components/builder/CreateBuildProjectClient";
import { DeleteBuildProjectButton } from "@/components/builder/DeleteBuildProjectButton";
import { ProjectCardActions } from "@/components/builder/ProjectCardActions";
import styles from "./ProjectsPage.module.css";
import { ProjectHomepageThumbnail } from "@/components/builder/ProjectHomepageThumbnail";
import { projectThumbnailEnabled } from "@/lib/build/projectThumbnail";

import { listBuildProjectsCommand } from "@zoeskoul/build-application";

import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { prisma } from "@zoeskoul/platform-server/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default async function ZoeBuildProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const access = await loadCurrentBuildAccessSnapshot();

  if (!access.userId) {
    // An existing but unverifiable builder session must not trigger endless
    // automatic sign-in retries. The user can explicitly retry from a public page.
    if ((await cookies()).has(SESSION_COOKIE)) {
      redirect("/auth/handoff/error?reason=session_unavailable");
    }
    const callbackUrl = `/${locale}/projects`;
    redirect(
      buildZoeBuildWebAuthenticateUrl({
          callbackUrl,
          locale,
        }),
    );
  }

  const projects = await listBuildProjectsCommand({
    access,
    reader: createPrismaBuildProjectReader(prisma),
  });

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div className="min-w-0">
          <h1 className={styles.title}>
            Your projects
          </h1>

          <p className={styles.subtitle}>
            Create, refine and publish your ideas with Zoé.
          </p>
        </div>

        <CreateBuildProjectClient locale={locale} />
      </div>

      {projects.length === 0 ? (
        <section className="ui-page-surface p-8">
          <div className="max-w-xl">
            <div className="ui-section-kicker">
              Start building
            </div>

            <h2 className="mt-2 text-xl font-semibold">
              Create your first project
            </h2>

            <p className="mt-2 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.9)]">
              Start with a website, web app, or storefront. Once the
              project opens, tell Zoé whether you want a business site,
              landing page, portfolio, content site, store, or something
              more custom.
            </p>
          </div>
        </section>
      ) : (
        <section className={styles.grid} aria-label="Projects">
          {projects.map((project) => {
            const href = `/${locale}/projects/${encodeURIComponent(project.buildProjectId)}`;
            return (
              <article key={project.buildProjectId} className={styles.card}>
                <Link href={href} className={styles.cardLink}>
                  <ProjectHomepageThumbnail
                    key={`${project.buildProjectId}:${project.sourceVersion}`}
                    title={project.title}
                    sourceVersion={project.sourceVersion}
                    enabled={projectThumbnailEnabled() && project.stackId === "tanstack-start-v1"}
                    src={`/api/build/projects/${encodeURIComponent(project.buildProjectId)}/thumbnail/${project.sourceVersion}`}
                  />
                  <div className={styles.metadata}>
                    <div className={styles.cardHeading}>
                      <h2 title={project.title}>{project.title}</h2>
                      <span className={styles.status}>{statusLabel(project.status)}</span>
                    </div>
                    <p className={styles.stack}>{project.stackId ?? "Stack pending"}</p>
                    <div className={styles.details}>
                      <span>Source v{project.sourceVersion}</span>
                      <time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleDateString(locale === "fr" ? "fr-FR" : locale === "ht" ? "ht-HT" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>
                    </div>
                  </div>
                </Link>
                <ProjectCardActions href={href} title={project.title} refreshThumbnailHref={projectThumbnailEnabled() && process.env.NEXT_PUBLIC_ZOEBUILD_PROJECT_THUMBNAILS_ENABLED === "true" && project.stackId === "tanstack-start-v1" ? `${href}?refreshThumbnail=${project.sourceVersion}` : undefined}>
                  <DeleteBuildProjectButton variant="menu" buildProjectId={project.buildProjectId} title={project.title} />
                </ProjectCardActions>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
