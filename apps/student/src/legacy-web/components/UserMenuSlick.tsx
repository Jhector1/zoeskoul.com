"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  email?: string | null;
  image?: string | null;
  profileHref?: string;
  onSignOut: () => void;
};

export default function UserMenuSlick({
                                        name,
                                        email,
                                        image,
                                        profileHref = "/profile",
                                        onSignOut,
                                      }: Props) {
  const t = useTranslations("UserMenu");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const initials =
      (name || "U")
          .split(" ")
          .filter(Boolean)
          .slice(0, 2)
          .map((s) => s[0]?.toUpperCase())
          .join("") || "U";

  return (
      <div className="relative" ref={wrapRef}>
        <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/[0.08]"
            aria-expanded={open}
            aria-label={t("ariaLabel")}
        >
        <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]">
          {image ? (
              <Image
                  src={image}
                  alt={t("avatarAlt", { name })}
                  width={24}
                  height={24}
                  className="h-6 w-6 object-cover"
                  unoptimized
              />
          ) : (
              <span className="text-[10px] font-medium text-neutral-800 dark:text-white/85">
              {initials}
            </span>
          )}
        </span>

          <span className="hidden max-w-[120px] truncate sm:block">{name}</span>

          <svg
              className={cn("h-3.5 w-3.5 text-neutral-500 transition-transform dark:text-white/50", open && "rotate-180")}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
          >
            <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
            />
          </svg>
        </button>

        <div
            className={cn(
                "absolute right-0 top-full z-50 mt-2 w-[240px] transition-all",
                open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
            )}
        >
          <div className="ui-surface-floating overflow-hidden">
            <div className="border-b border-neutral-200 px-3 py-3 dark:border-white/10">
              <div className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                {name}
              </div>
              {email ? (
                  <div className="mt-0.5 truncate text-[12px] text-neutral-500 dark:text-white/55">
                    {email}
                  </div>
              ) : null}
            </div>

            <div className="grid gap-1 p-1.5">
              <Link
                  href={profileHref}
                  onClick={() => setOpen(false)}
                  className="flex h-8 items-center rounded-md px-2 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-white/80 dark:hover:bg-white/[0.06]"
              >
                {t("profile")}
              </Link>

              <Link
                  // intentionaly leave htag
                  href="#"
                  onClick={() => setOpen(false)}
                  className="flex h-8 items-center rounded-md px-2 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-white/80 dark:hover:bg-white/[0.06]"
              >
                {t("progress")}
              </Link>

              <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSignOut();
                  }}
                  className="flex h-8 items-center rounded-md px-2 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-400/10"
              >
                {t("logout")}
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}