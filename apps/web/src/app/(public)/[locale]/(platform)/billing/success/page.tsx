// src/app/(public)/[locale]/(platform)/billing/success/BillingSuccessPageClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

type ConfirmResp =
    | {
  ok: true;
  status: string;
  priceId: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  subscriptionId: string | null;
}
    | { ok: false; message: string };

function safeInternalPathOrNull(path?: string | null) {
  const raw = String(path ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("//")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function formatWhen(x: string | null, locale: string) {
  if (!x) return "—";
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return x;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

type PlanKey = "monthly" | "yearly" | "unknown";
function planKeyFromPriceId(priceId: string | null): PlanKey {
  const id = (priceId ?? "").toLowerCase();
  if (id.includes("year") || id.includes("annual")) return "yearly";
  if (id.includes("month") || id.includes("monthly")) return "monthly";
  return "unknown";
}

const KNOWN_STRIPE_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
  "none",
]);

function Pill({ children }: { children: React.ReactNode }) {
  return (
      <span
          className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold",
              "border border-neutral-200/70 bg-white/70 text-neutral-700",
              "dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80",
          )}
      >
      {children}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
      <div
          className={cn(
              "rounded-3xl border overflow-hidden shadow-sm",
              "border-neutral-200/70 bg-white/80",
              "dark:border-white/10 dark:bg-neutral-950/60 dark:shadow-none",
          )}
      >
        {children}
      </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
      <div
          className={cn(
              "rounded-2xl border shadow-sm",
              "border-neutral-200/70 bg-white/70",
              "dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none",
          )}
      >
        {children}
      </div>
  );
}

function Soft({ children }: { children: React.ReactNode }) {
  return (
      <div
          className={cn(
              "rounded-2xl border",
              "border-neutral-200/70 bg-neutral-50/80",
              "dark:border-white/10 dark:bg-black/20",
          )}
      >
        {children}
      </div>
  );
}

export default function BillingSuccessPageClient() {
  const t = useTranslations("billing.success");
  const tStatus = useTranslations("billing.statusPanel"); // reuse your existing status/plan labels
  const locale = useLocale();

  const sp = useSearchParams();
  const router = useRouter();

  const sessionId = sp.get("session_id");
  const nextParam = sp.get("next");

  const [busy, setBusy] = useState(true);
  const [data, setData] = useState<ConfirmResp | null>(null);

  const COUNT_NUM = 10;

  // auto-redirect controls
  const [auto, setAuto] = useState(true);
  const [countdown, setCountdown] = useState(COUNT_NUM);
  const redirectedRef = useRef(false);
  const cancelAutoRef = useRef(false);

  const nextSafe = useMemo(() => {
    const p = safeInternalPathOrNull(nextParam);
    if (p) return p;
    return `/${locale}/billing`;
  }, [nextParam, locale]);

  const ok = data?.ok === true;

  const planName = useMemo(() => {
    if (!ok) return tStatus("planUnknown");

    const key = planKeyFromPriceId((data as any).priceId ?? null);
    if (key === "monthly") return tStatus("planMonthly");
    if (key === "yearly") return tStatus("planYearly");
    return tStatus("planUnknown");
  }, [ok, data, tStatus]);

  const statusLabel = useMemo(() => {
    if (!ok) return null;
    const s = String((data as any).status ?? "").trim();
    if (!s) return null;
    if (KNOWN_STRIPE_STATUSES.has(s)) return tStatus(`statuses.${s}` as any);
    return s;
  }, [ok, data, tStatus]);

  // confirm subscription
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!sessionId || sessionId.includes("CHECKOUT_SESSION_ID")) {
        if (!alive) return;
        setData({ ok: false, message: t("errors.missingSession") });
        setBusy(false);
        return;
      }

      setBusy(true);

      try {
        const r = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ sessionId }),
        });

        const j = (await r.json().catch(() => null)) as ConfirmResp | null;
        if (!alive) return;

        if (!r.ok || !j) {
          setData({ ok: false, message: (j as any)?.message ?? t("errors.confirmFailed") });
        } else {
          setData(j);
        }
      } catch (e: any) {
        if (!alive) return;
        setData({ ok: false, message: e?.message ?? t("errors.confirmFailed") });
      } finally {
        if (!alive) return;
        setBusy(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [sessionId, t]);

  // auto-redirect with countdown + cancel
  useEffect(() => {
    if (busy) return;
    if (!ok) return;
    if (!auto) return;
    if (redirectedRef.current) return;
    if (cancelAutoRef.current) return;

    setCountdown(COUNT_NUM);

    const tick = setInterval(() => setCountdown((s) => Math.max(0, s - 1)), 1000);

    const go = setTimeout(() => {
      if (cancelAutoRef.current) return;
      redirectedRef.current = true;
      router.replace(nextSafe);
    }, COUNT_NUM * 1000);

    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [busy, ok, auto, nextSafe, router]);

  const headerTitle = busy ? t("title.busy") : ok ? t("title.ok") : t("title.fail");
  const headerSub = busy ? t("subtitle.busy") : ok ? t("subtitle.ok") : t("subtitle.fail");

  return (
      <div
          className={cn(
              "relative min-h-screen text-neutral-900 dark:text-white",
              "bg-[radial-gradient(1200px_700px_at_20%_0%,#eafff5_0%,#ffffff_52%,#f6f7ff_100%)]",
              "dark:bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_52%)]",
          )}
      >
        <div
            aria-hidden
            className={cn(
                "pointer-events-none absolute inset-x-0 top-0 h-48 opacity-70 blur-2xl",
                "bg-[linear-gradient(90deg,rgba(16,185,129,0.10),rgba(59,130,246,0.06),rgba(236,72,153,0.05))]",
                "dark:bg-[linear-gradient(90deg,rgba(110,231,183,0.08),rgba(147,197,253,0.05),rgba(251,113,133,0.04))]",
            )}
        />

        <div className="ui-container py-6 md:py-10 relative">
          <div className="mx-auto max-w-2xl grid gap-4">
            <Card>
              <div className="border-b border-neutral-200/70 bg-white/70 p-6 backdrop-blur-xl dark:border-white/10 dark:bg-black/20">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="text-xs font-extrabold tracking-wide text-neutral-500 dark:text-white/60">
                      {t("kicker")}
                    </div>

                    <div className="mt-1 text-lg md:text-xl font-black tracking-tight">
                      {headerTitle}
                    </div>

                    <div className="mt-1 text-sm text-neutral-600 dark:text-white/70">
                      {headerSub}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Pill>{t("pills.plan", { plan: planName })}</Pill>
                    {ok ? <Pill>{t("pills.status", { status: statusLabel ?? String((data as any).status ?? "") })}</Pill> : null}
                  </div>
                </div>
              </div>

              <div className="p-6 grid gap-4">
                {!busy && !ok ? (
                    <Panel>
                      <div
                          className={cn(
                              "p-5 rounded-2xl",
                              "border border-rose-300/40 bg-rose-100/60 text-neutral-900",
                              "dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-white/90",
                          )}
                      >
                        <div className="font-black">{t("errorPanel.title")}</div>
                        <div className="mt-1 text-xs opacity-80">
                          {(data as any)?.message ?? t("errors.unknown")}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button className="ui-btn ui-btn-secondary" onClick={() => window.location.reload()}>
                            {t("errorPanel.retry")}
                          </button>
                          <button className="ui-btn ui-btn-primary" onClick={() => router.push(`/${locale}/billing`)}>
                            {t("errorPanel.goBilling")}
                          </button>
                        </div>
                      </div>
                    </Panel>
                ) : null}

                {!busy && ok ? (
                    <div className="grid gap-4">
                      <div className="flex flex-wrap gap-2">
                        <Pill>{t("pills.status", { status: statusLabel ?? String((data as any).status ?? "") })}</Pill>
                        {(data as any).trialEnd ? (
                            <Pill>{t("pills.trialEnds", { when: formatWhen((data as any).trialEnd, locale) })}</Pill>
                        ) : null}
                        {(data as any).currentPeriodEnd ? (
                            <Pill>{t("pills.renews", { when: formatWhen((data as any).currentPeriodEnd, locale) })}</Pill>
                        ) : null}
                      </div>

                      <Panel>
                        <div className="p-5 grid gap-3">
                          <div className="text-xs font-extrabold tracking-wide text-neutral-500 dark:text-white/60">
                            {t("unlocked.kicker")}
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <Soft>
                              <div className="p-4">
                                <div className="text-sm font-black text-neutral-900 dark:text-white/90">
                                  {t("unlocked.practiceTitle")}
                                </div>
                                <div className="mt-1 text-sm text-neutral-600 dark:text-white/70">
                                  {t("unlocked.practiceDesc")}
                                </div>
                              </div>
                            </Soft>

                            <Soft>
                              <div className="p-4">
                                <div className="text-sm font-black text-neutral-900 dark:text-white/90">
                                  {t("unlocked.assignTitle")}
                                </div>
                                <div className="mt-1 text-sm text-neutral-600 dark:text-white/70">
                                  {t("unlocked.assignDesc")}
                                </div>
                              </div>
                            </Soft>
                          </div>
                        </div>
                      </Panel>

                      <Panel>
                        <div className="p-5 grid gap-3">
                          <div className="text-xs font-extrabold tracking-wide text-neutral-500 dark:text-white/60">
                            {t("next.kicker")}
                          </div>

                          <div className="text-sm text-neutral-700 dark:text-white/80">
                            {auto ? (
                                <>
                                  {t("next.auto", { s: countdown })}
                                </>
                            ) : (
                                <>{t("next.manual")}</>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button className="ui-btn ui-btn-primary" onClick={() => router.replace(nextSafe)}>
                              {t("actions.continue")}
                            </button>

                            {auto ? (
                                <button
                                    className="ui-btn ui-btn-secondary"
                                    onClick={() => {
                                      cancelAutoRef.current = true;
                                      setAuto(false);
                                    }}
                                >
                                  {t("actions.stayHere")}
                                </button>
                            ) : null}

                            <button className="ui-btn ui-btn-secondary" onClick={() => router.push(`/${locale}/billing`)}>
                              {t("actions.manageBilling")}
                            </button>
                          </div>
                        </div>
                      </Panel>
                    </div>
                ) : null}

                {busy ? (
                    <Panel>
                      <div className="p-5">
                        <div className="text-sm font-black text-neutral-900 dark:text-white/90">
                          {t("sync.title")}
                        </div>
                        <div className="mt-1 text-sm text-neutral-600 dark:text-white/70">
                          {t("sync.desc")}
                        </div>

                        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
                          <div className="h-full w-1/2 rounded-full bg-emerald-400/70" />
                        </div>

                        <div className="mt-3 text-xs text-neutral-500 dark:text-white/60">
                          {t("sync.note")}
                        </div>
                      </div>
                    </Panel>
                ) : null}

                <div className="pt-1 text-xs text-neutral-500 dark:text-white/55">
                  {t("tip")}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
  );
}