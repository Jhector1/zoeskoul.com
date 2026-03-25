// src/app/[locale]/practice/page.tsx
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { LandingPageConfig, LandingPart } from "./landingCatalog";
import { ALL_LANDINGS } from "./landingCatalog";
import React from "react";

const ACCENT = {
  emerald: "border-emerald-300/30 bg-emerald-300/10 text-white hover:bg-emerald-300/15",
  sky: "border-sky-300/30 bg-sky-300/10 text-white hover:bg-sky-300/15",
  violet: "border-violet-300/30 bg-violet-300/10 text-white hover:bg-violet-300/15",
  amber: "border-amber-300/30 bg-amber-300/10 text-white hover:bg-amber-300/15",
} as const;

const BADGE = {
  emerald: "border-emerald-300/30 bg-emerald-300/10 text-white",
  sky: "border-sky-300/30 bg-sky-300/10 text-white",
  violet: "border-violet-300/30 bg-violet-300/10 text-white",
  amber: "border-amber-300/30 bg-amber-300/10 text-white",
} as const;


function PartCard({ cfg, part }: { cfg: LandingPageConfig; part: LandingPart }) {
  const t = useTranslations(cfg.namespace);

  // (Optional) safer: avoid crashing if a key is missing
  const safeT = (key: string) => (t.has(key as any) ? t(key as any) : key);

  const badge = safeT(part.badgeKey);
  const title = safeT(part.titleKey);
  const subtitle = safeT(part.subtitleKey);

  const bullets = Array.from({ length: part.bulletsCount }, (_, i) =>
    safeT(`parts.${part.id.replace("-", "")}.bullets.${i}`)
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-black tracking-tight text-white/90">
              {title}
            </div>
            <div className="mt-1 text-sm text-white/70">{subtitle}</div>
          </div>

          <span
            className={[
              "shrink-0 rounded-full border px-3 py-1 text-[11px] font-extrabold",
              BADGE[part.accent],
            ].join(" ")}
          >
            {badge}
          </span>
        </div>

        <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-xs font-extrabold text-white/70">
            {safeT("whatYouLearn")}
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-white/70">
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <Link
            href={part.learnHref}
            className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold hover:bg-white/15"
          >
            {safeT("readMaterial")}
          </Link>

          <Link
            href={part.practiceHref}
            className={[
              "rounded-xl border px-3 py-2 text-xs font-extrabold transition",
              ACCENT[part.accent],
            ].join(" ")}
          >
            {safeT("practiceNow")}
          </Link>
        </div>

        <div className="text-xs text-white/50">{safeT("practiceNowHint")}</div>
      </div>
    </div>
  );
}
function CollapsibleSection({
  title,
  subtitle,
  right,
  children,
  defaultOpen = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section className="mt-6 first:mt-0">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5 text-left hover:bg-white/[0.06] transition"
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="text-lg font-black tracking-tight text-white/90">
                {title}
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-extrabold text-white/70">
                {open ? "Hide" : "Show"}
              </span>
            </div>
            {!!subtitle && <div className="mt-1 text-sm text-white/70">{subtitle}</div>}
          </div>

          {/* optional right-side action (e.g. quick-start links) */}
          {!!right && (
            <div
              className="shrink-0"
              onClick={(e) => e.stopPropagation()} // prevent toggling when clicking links
            >
              {right}
            </div>
          )}
        </div>
      </button>

      {/* Collapsed content */}
      {open && (
        <div className="mt-3">
          {children}
        </div>
      )}
    </section>
  );
}

function LandingSection({ cfg }: { cfg: LandingPageConfig }) {
  const t = useTranslations(cfg.namespace);
  const safeT = (key: string) => (t.has(key as any) ? t(key as any) : key);

  const right = !!cfg.quickStarts?.length ? (
    <div className="flex flex-wrap gap-2">
      {cfg.quickStarts.map((q) => (
        <Link
          key={q.href}
          href={q.href}
          className={[
            "rounded-xl border px-3 py-2 text-xs font-extrabold text-white transition",
            ACCENT[q.accent],
          ].join(" ")}
        >
          {safeT(q.labelKey)}
        </Link>
      ))}
    </div>
  ) : null;

  return (
    <CollapsibleSection
      title={safeT(cfg.pageTitleKey)}
      subtitle={safeT(cfg.pageIntroKey)}
      right={right}
      defaultOpen={false} // ✅ collapsed by default
    >
      {/* cards */}
      <div className="grid gap-3 md:grid-cols-2">
        {cfg.parts.map((p) => (
          <PartCard key={`${cfg.namespace}:${p.id}`} cfg={cfg} part={p} />
        ))}
      </div>

      {/* recommended path */}
      {!!cfg.recommended && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
          <div className="text-sm font-black text-white/90">
            {safeT(cfg.recommended.titleKey)}
          </div>

          <ol className="mt-3 space-y-2 text-sm text-white/70">
            {Array.from({ length: cfg.recommended.itemsCount }, (_, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-extrabold text-white/90">{i + 1}.</span>
                <span>{safeT(`recommended.${i}`)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!!cfg.routeHintKey && (
        <div className="mt-4 text-xs text-white/50">{safeT(cfg.routeHintKey)}</div>
      )}
    </CollapsibleSection>
  );
}

export default function PracticeLandingPage() {
  return (
    <div className="min-h-screen p-4 md:p-6 bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_50%)] text-white/90">
      <div className="mx-auto max-w-5xl">
        {ALL_LANDINGS.map((cfg) => (
          <LandingSection key={cfg.namespace} cfg={cfg} />
        ))}
      </div>
    </div>
  );
}
