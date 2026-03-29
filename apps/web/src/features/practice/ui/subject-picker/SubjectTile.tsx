"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import type { SubjectCard } from "./SubjectPicker";
import { cloudinaryImageUrl } from "@/lib/cloudinary/url";
import { cn } from "@/lib/cn";
import Pill from "./Pill";
import { useTaggedT } from "@/i18n/tagged";

function publicIdFallback(slug: string) {
  const map: Record<string, string> = {
    "linear-algebra": "learnoir/subjects/linear-algebra",
    python: "learnoir/subjects/python",
  };
  return map[slug] ?? "learnoir/subjects/_default";
}

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
  const disabled = !s.defaultModuleSlug || enrolling || isComingSoon;

  const publicId = s.imagePublicId ?? publicIdFallback(s.slug);

  const url = cloudinaryImageUrl(publicId, {
    w: 1400,
    h: 760,
    crop: "fill",
    gravity: "auto",
    quality: "auto",
    format: "auto",
    dpr: "auto",
  });

  const imgSrc = url || "/subjects/_default.png";

  const cta = useMemo(() => {
    if (isComingSoon) return t("comingSoon");
    if (enrolling) return t("enrolling");
    if (s.enrolled) return t("continue");
    return t("openModules");
  }, [enrolling, isComingSoon, s.enrolled, t]);

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
          <Image
              src={imgSrc}
              alt={s.imageAlt ?? s.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/12 to-transparent" />

          <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center rounded-md bg-black/35 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/95 backdrop-blur-sm">
                {s.slug}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {isComingSoon ? <Pill tone="warn">{t("comingSoon")}</Pill> : null}
              {s.enrolled && !enrolling && !isComingSoon ? (
                  <Pill tone="good">{t("enrolled")}</Pill>
              ) : null}
              {enrolling ? <Pill tone="neutral">{t("enrolling")}</Pill> : null}
            </div>
          </div>

          <div className="absolute inset-x-4 bottom-4">
            <div className="text-lg font-semibold tracking-tight text-white sm:text-xl">
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
              {!s.defaultModuleSlug ? (
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