import Link from "next/link";
import { redirect } from "next/navigation";

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
    const callbackUrl = `/${locale}/projects`;
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  }

  const projects = await listBuildProjectsCommand({
    access,
    reader: createPrismaBuildProjectReader(prisma),
  });

  return (
    <main className="ui-container py-8">
      <div className="mb-7">
        <div className="ui-section-kicker">Zoé Build</div>
        <h1 className="ui-section-title">Your projects</h1>
        <p className="ui-section-subtitle">
          Source projects are stored in Zoéskoul. Build execution and publishing
          remain disabled until their dedicated runtime boundaries are enabled.
        </p>
      </div>

      {projects.length === 0 ? (
        <section className="ui-page-surface p-6">
          <h2 className="text-lg font-semibold">No Build projects yet</h2>
          <p className="mt-2 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
            The authenticated create-project API is ready. The guided Zoé
            creation experience comes in a later UI wave.
          </p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.buildProjectId}
              href={`/${locale}/projects/${encodeURIComponent(project.buildProjectId)}`}
              className="ui-page-surface block p-5 transition hover:-translate-y-0.5 hover:shadow-md"
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
          ))}
        </section>
      )}
    </main>
  );
}
