import { buildZoeBuildWebAuthenticateUrl } from "@/lib/webAuthHandoff";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/buildHandoff";
import { redirect } from "next/navigation";

import CreateBuildProjectClient from "@/components/builder/CreateBuildProjectClient";
import { DeleteBuildProjectButton } from "@/components/builder/DeleteBuildProjectButton";

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
    <main className="ui-container py-8">
      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="ui-section-kicker">
            Zoé Build
          </div>

          <h1 className="ui-section-title">
            Your projects
          </h1>

          <p className="ui-section-subtitle">
            Create a project, then open it anytime to build with Zoé,
            preview the result, or edit the source.
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
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <article key={project.buildProjectId} className="ui-page-surface p-5">
            <Link
              href={`/${locale}/projects/${encodeURIComponent(project.buildProjectId)}`}
              className="block transition hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">
                    {project.title}
                  </h2>
                  <p className="mt-1 text-xs text-[rgb(var(--ui-text-muted)/0.85)]">
                    {project.stackId ?? "Stack pending"}
                  </p>
                </div>
                <span className="rounded-full border border-[rgb(var(--ui-border)/0.8)] px-2.5 py-1 text-[11px] font-semibold capitalize">
                  {statusLabel(project.status)}
                </span>
              </div>

              <div className="mt-5 flex items-center justify-between text-xs text-[rgb(var(--ui-text-muted)/0.85)]">
                <span>Source v{project.sourceVersion}</span>
                <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
              </div>
            </Link>
            <DeleteBuildProjectButton buildProjectId={project.buildProjectId} title={project.title} />
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
