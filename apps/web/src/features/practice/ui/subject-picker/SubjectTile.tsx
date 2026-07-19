"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import type { SubjectCard } from "./SubjectPicker";
import { cloudinaryImageUrl } from "@/lib/cloudinary/url";
import { cn } from "@/lib/cn";
import Pill from "./Pill";
import { useTaggedT } from "@/i18n/tagged";
import { resolveCatalogCourseStatusPresentation } from "@/lib/subjects/catalogCourseStatus";

export default function SubjectTile({
                                      s,
                                      onPick,
                                      enrolling,
                                    }: {
  s: SubjectCard;
  onPick: (s: SubjectCard) => void;
  enrolling: boolean;
}) {
  const { t } = useTaggedT("subjectsUi");
    const isComingSoon = s.status === "coming_soon";
    const isEnterable = Boolean(s.subjectId) && !isComingSoon;
    const isMissingFromDb = !s.subjectId && !isComingSoon;
    const disabled = !isEnterable || !s.defaultModuleSlug || enrolling || isComingSoon;
    const statusPresentation = resolveCatalogCourseStatusPresentation(s);
    const imageUrl = s.imagePublicId
      ? cloudinaryImageUrl(s.imagePublicId, {
          w: 1400,
          h: 760,
          crop: "fill",
          gravity: "auto",
          quality: "auto",
          format: "auto",
          dpr: "auto",
        })
      : null;

    const cta = useMemo(() => {
        if (isComingSoon) return t("comingSoon");
        if (!isEnterable) return "Not seeded";
        if (enrolling) return t("enrolling");
        if (s.enrolled) return t("continue");
        return t("openModules");
    }, [enrolling, isComingSoon, isEnterable, s.enrolled, t]);

  return (
      <button
          type="button"
          disabled={disabled}
          aria-busy={enrolling}
          onClick={() => onPick(s)}
          className={cn(
              "group ui-page-surface overflow-hidden text-left transition-colors",
              disabled
                  ? "cursor-not-allowed opacity-75"
                  : "hover:border-neutral-300 dark:hover:border-white/15",
          )}
      >
        <div className="relative h-40 border-b border-neutral-200 dark:border-white/10 sm:h-44">
          {imageUrl ? (
              <>
                <Image
                    src={imageUrl}
                    alt={s.imageAlt ?? s.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/12 to-transparent" />
              </>
          ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-white dark:from-slate-800 dark:via-slate-900 dark:to-slate-800">
                <div className="absolute inset-0 opacity-[0.22] [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.7),transparent_28%),radial-gradient(circle_at_60%_70%,rgba(255,255,255,0.55),transparent_34%)]" />
              </div>
          )}

          <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={cn(
                  "inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] backdrop-blur-sm",
                  imageUrl
                      ? "bg-black/35 text-white/95"
                      : "bg-white/70 text-neutral-800 dark:bg-black/25 dark:text-white/90",
              )}>
                {s.slug}
              </div>
            </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                  {isMissingFromDb ? (
                      <Pill tone="warn">Not seeded</Pill>
                  ) : null}

                  {statusPresentation.lifecycleLabel ? (
                      <Pill tone="neutral">{statusPresentation.lifecycleLabel}</Pill>
                  ) : null}

                  {isComingSoon ? <Pill tone="warn">{t("comingSoon")}</Pill> : null}

                  {s.enrolled && !enrolling && !isComingSoon ? (
                      <Pill tone="good">{t("enrolled")}</Pill>
                  ) : null}

                  {enrolling ? <Pill tone="neutral">{t("enrolling")}</Pill> : null}
              </div>
          </div>

          <div className="absolute inset-x-4 bottom-4">
            <div className={cn(
                "text-lg font-semibold tracking-tight sm:text-xl",
                imageUrl ? "text-white" : "text-neutral-900 dark:text-white",
            )}>
              {s.title}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-sm leading-6 text-neutral-600 dark:text-white/68 line-clamp-3">
            {s.description}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
                {isComingSoon ? (
                    <div className="inline-flex items-center gap-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        <span className="h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-300" />
                        <span>{cta}</span>
                    </div>
                ) : !isEnterable ? (
                    <div className="text-[11px] font-medium text-red-700 dark:text-red-300">
                        Not seeded in Prisma
                    </div>
                ) : !s.defaultModuleSlug ? (
                    <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        {t("noModulesYet")}
                    </div>
                ) : (
                    <div className="inline-flex items-center gap-2 text-[11px] font-medium text-neutral-900 dark:text-white/85">
                        {!isComingSoon ? (
                            <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-300" />
                        ) : (
                            <span className="h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-300" />
                        )}

                        <span>{cta}</span>
                    </div>
                )}
            </div>

            <div
                className={cn(
                    "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
                    disabled
                        ? "bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-white/45"
                        : "bg-neutral-900 text-white group-hover:translate-x-0.5 dark:bg-white/10 dark:text-white/90 dark:hover:bg-white/12",
                )}
            >
              {enrolling ? (
                  <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent dark:border-white/55" />
              </span>
              ) : isComingSoon ? (
                  "•"
              ) : (
                  "→"
              )}
            </div>
          </div>
        </div>
      </button>
  );
}
