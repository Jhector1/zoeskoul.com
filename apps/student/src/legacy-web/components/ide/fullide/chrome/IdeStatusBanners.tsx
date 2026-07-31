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
            <div className="border-b border-neutral-200/80 bg-neutral-50 px-3 py-2 text-[11px] font-medium text-neutral-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60">
              Loading saved project…
            </div>
        ) : null}

        {saveError ? (
            <div className="border-b border-red-200/80 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
              {saveError}
            </div>
        ) : null}
      </>
  );
}