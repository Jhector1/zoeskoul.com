// src/components/UserMenuSlick.tsx
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
        className="group ui-user-btn"
        aria-expanded={open}
        aria-label={t("ariaLabel")}
      >
        <span className="ui-avatar-wrap">
          {image ? (
            <Image
              src={image}
              alt={t("avatarAlt", { name })}
              width={32}
              height={32}
              className="h-8 w-8 object-cover"
              unoptimized
            />
          ) : (
            <span className="text-[11px] font-black text-neutral-800 dark:text-white/85">
              {initials}
            </span>
          )}
        </span>

        <span className="ui-user-name">{name}</span>

        <svg
          className={cn("ui-user-chevron", open && "rotate-180")}
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

      {/* Dropdown */}
      <div
        className={cn(
          "ui-user-panelwrap",
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-1 pointer-events-none",
        )}
      >
        <div className={cn("ui-user-panel", "relative")}>
          <div aria-hidden className="ui-user-panelglow" />

          <div className="relative">
            <div className="ui-user-panelheader">
              <div className="text-sm font-extrabold truncate text-neutral-900 dark:text-white">
                {name}
              </div>
              {email ? (
                <div className="mt-0.5 text-[12px] truncate text-neutral-600 dark:text-white/60">
                  {email}
                </div>
              ) : null}
            </div>

            <div className="p-2">
              <Link href={profileHref} onClick={() => setOpen(false)} className="ui-user-item">
                {t("profile")}
              </Link>

              <Link href="/progress" onClick={() => setOpen(false)} className="ui-user-item">
                {t("progress")}
              </Link>

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="ui-user-logout"
              >
                {t("logout")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
