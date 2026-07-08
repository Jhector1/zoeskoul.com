import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import PublicChallengePublisher from "@/components/admin/public-challenges/PublicChallengePublisher";
import { listPublishedChallengeExerciseOptions } from "@/lib/practice/challenges/publishedCatalog";
import { resolveChallengePublisherAccess } from "@/lib/practice/challenges/publisherAccess";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public challenges · Admin",
  description: "Create public links for published code-input projects.",
  robots: { index: false, follow: false },
};

type PublicChallengesPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function PublicChallengesPage({
  params,
}: PublicChallengesPageProps) {
  const { locale } = await params;
  const currentPath = `/${locale}/admin/public-challenges`;
  const access = await resolveChallengePublisherAccess();

  if (!access.authenticated) {
    redirect(
      `/${locale}/authenticate?callbackUrl=${encodeURIComponent(currentPath)}`,
    );
  }

  if (!access.allowed) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm sm:p-8">
          <div className="text-sm font-semibold uppercase tracking-wide text-amber-800">
            Publisher access required
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
            You cannot create public challenge links with this account.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-700">
            Add this account as an admin, publisher, or author, or include its
            email in <code>CHALLENGE_PUBLISHER_EMAILS</code>.
          </p>
          {access.email ? (
            <p className="mt-3 text-sm text-neutral-600">
              Signed in as <span className="font-medium">{access.email}</span>
            </p>
          ) : null}
          <Link
            href={`/${locale}`}
            className="mt-6 inline-flex rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Back to site
          </Link>
        </section>
      </main>
    );
  }

  const options = await listPublishedChallengeExerciseOptions();
  const projectCount = options.length;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-sm font-medium text-indigo-700">
            Publisher tools
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
            Published public challenges
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            Select one code-input project from the generated, seeded live
            curriculum and create an anonymous practice-trial link. The exercise
            is referenced, not copied, and no challenge database table is required.
          </p>
        </div>

        <Link
          href={`/${locale}`}
          className="w-fit rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
        >
          Back to site
        </Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Shareable exercises
          </div>
          <div className="mt-1 text-2xl font-semibold text-neutral-950">
            {options.length}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Code projects
          </div>
          <div className="mt-1 text-2xl font-semibold text-amber-950">
            {projectCount}
          </div>
        </div>
      </div>

      <PublicChallengePublisher
        options={options}
        initialLocale={locale}
      />

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-600">
        Only non-PTY code-input projects are shareable. Quiz exercises and
        terminal-backed projects are intentionally excluded from this publisher.
      </div>
    </main>
  );
}
