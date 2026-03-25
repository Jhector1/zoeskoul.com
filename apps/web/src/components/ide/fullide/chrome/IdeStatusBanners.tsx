"use client";

export default function IdeStatusBanners({
  loadingProject,
  saveError,
}: {
  loadingProject: boolean;
  saveError: string | null;
}) {
  return (
    <>
      {loadingProject ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70">
          Loading saved project…
        </div>
      ) : null}

      {saveError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
          {saveError}
        </div>
      ) : null}
    </>
  );
}
