"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import Badge, { type BadgeTone } from "@/components/billing/Badge";
import {
  BillingCard,
  BillingPanel,
  BillingSectionHeader,
  BillingSoftPanel,
} from "@/components/billing/BillingPrimitives";

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
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
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

function toneForStatus(status: string | null | undefined): BadgeTone {
  switch (status) {
    case "active":
    case "trialing":
      return "good";
    case "past_due":
    case "incomplete":
    case "paused":
      return "warn";
    case "unpaid":
    case "canceled":
    case "incomplete_expired":
      return "danger";
    default:
      return "neutral";
  }
}

export default function BillingSuccessPageClient() {
  const t = useTranslations("billing.success");
  const tStatus = useTranslations("billing.statusPanel");
  const locale = useLocale();

  const sp = useSearchParams();
  const router = useRouter();

  const sessionId = sp.get("session_id");
  const nextParam = sp.get("next");

  const [busy, setBusy] = useState(true);
  const [data, setData] = useState<ConfirmResp | null>(null);

  const COUNT_NUM = 10;
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

    const key = planKeyFromPriceId(data.priceId ?? null);
    if (key === "monthly") return tStatus("planMonthly");
    if (key === "yearly") return tStatus("planYearly");
    return tStatus("planUnknown");
  }, [ok, data, tStatus]);

  const rawStatus = ok ? String(data.status ?? "").trim() : null;
  const statusTone = toneForStatus(rawStatus);

  const statusLabel = useMemo(() => {
    if (!ok) return null;
    const s = String(data.status ?? "").trim();
    if (!s) return null;
    if (KNOWN_STRIPE_STATUSES.has(s)) return tStatus(`statuses.${s}` as never);
    return s;
  }, [ok, data, tStatus]);

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

  useEffect(() => {
    if (busy) return;
    if (!ok) return;
    if (!auto) return;
    if (redirectedRef.current) return;
    if (cancelAutoRef.current) return;

    setCountdown(COUNT_NUM);

    const tick = setInterval(() => {
      setCountdown((s) => Math.max(0, s - 1));
    }, 1000);

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
          className="relative min-h-screen p-4 md:p-6"
          style={{
            backgroundColor: "rgb(var(--ui-bg) / 1)",
            color: "rgb(var(--ui-text) / 1)",
          }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
              className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
              style={{
                backgroundImage:
                    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.8) 1px, transparent 0)",
                backgroundSize: "18px 18px",
              }}
          />
        </div>

        <div className="relative mx-auto max-w-2xl">
          <BillingCard>
            <BillingSectionHeader className="p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="ui-kicker">{t("kicker")}</div>
                  <div className="mt-1 ui-title-md">{headerTitle}</div>
                  <div className="mt-1 ui-meta">{headerSub}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{t("pills.plan", { plan: planName })}</Badge>
                  {ok ? (
                      <Badge tone={statusTone}>
                        {t("pills.status", {
                          status: statusLabel ?? String(data.status ?? ""),
                        })}
                      </Badge>
                  ) : null}
                </div>
              </div>
            </BillingSectionHeader>

            <div className="grid gap-4 p-6">
              {!busy && !ok ? (
                  <BillingPanel>
                    <div className="ui-surface-danger p-5">
                      <div className="ui-title-sm">{t("errorPanel.title")}</div>
                      <div className="mt-1 ui-meta-strong">{data?.message ?? t("errors.unknown")}</div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button className="ui-btn-secondary" onClick={() => window.location.reload()}>
                          {t("errorPanel.retry")}
                        </button>
                        <button
                            className="ui-btn-primary"
                            onClick={() => router.push(`/${locale}/billing`)}
                        >
                          {t("errorPanel.goBilling")}
                        </button>
                      </div>
                    </div>
                  </BillingPanel>
              ) : null}

              {!busy && ok ? (
                  <div className="grid gap-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={statusTone}>
                        {t("pills.status", {
                          status: statusLabel ?? String(data.status ?? ""),
                        })}
                      </Badge>

                      {data.trialEnd ? (
                          <Badge>{t("pills.trialEnds", { when: formatWhen(data.trialEnd, locale) })}</Badge>
                      ) : null}

                      {data.currentPeriodEnd ? (
                          <Badge>
                            {t("pills.renews", {
                              when: formatWhen(data.currentPeriodEnd, locale),
                            })}
                          </Badge>
                      ) : null}
                    </div>

                    <BillingPanel>
                      <div className="grid gap-3 p-5">
                        <div className="ui-kicker">{t("unlocked.kicker")}</div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <BillingSoftPanel className="p-4">
                            <div className="ui-title-sm">{t("unlocked.practiceTitle")}</div>
                            <div className="mt-1 ui-meta">{t("unlocked.practiceDesc")}</div>
                          </BillingSoftPanel>

                          <BillingSoftPanel className="p-4">
                            <div className="ui-title-sm">{t("unlocked.assignTitle")}</div>
                            <div className="mt-1 ui-meta">{t("unlocked.assignDesc")}</div>
                          </BillingSoftPanel>
                        </div>
                      </div>
                    </BillingPanel>

                    <BillingPanel>
                      <div className="grid gap-3 p-5">
                        <div className="ui-kicker">{t("next.kicker")}</div>

                        <div className="text-sm text-neutral-700 dark:text-white/80">
                          {auto ? t("next.auto", { s: countdown }) : t("next.manual")}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button className="ui-btn-primary" onClick={() => router.replace(nextSafe)}>
                            {t("actions.continue")}
                          </button>

                          {auto ? (
                              <button
                                  className="ui-btn-secondary"
                                  onClick={() => {
                                    cancelAutoRef.current = true;
                                    setAuto(false);
                                  }}
                              >
                                {t("actions.stayHere")}
                              </button>
                          ) : null}

                          <button
                              className="ui-btn-secondary"
                              onClick={() => router.push(`/${locale}/billing`)}
                          >
                            {t("actions.manageBilling")}
                          </button>
                        </div>
                      </div>
                    </BillingPanel>
                  </div>
              ) : null}

              {busy ? (
                  <BillingPanel>
                    <div className="p-5">
                      <div className="ui-title-sm">{t("sync.title")}</div>
                      <div className="mt-1 ui-meta">{t("sync.desc")}</div>

                      <div className="ui-progress-track mt-4">
                        <div className="ui-progress-fill w-1/2" />
                      </div>

                      <div className="mt-3 ui-meta">{t("sync.note")}</div>
                    </div>
                  </BillingPanel>
              ) : null}

              <div className="ui-meta">{t("tip")}</div>
            </div>
          </BillingCard>
        </div>
      </div>
  );
}