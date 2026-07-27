"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { shouldShowMarketingConsentPrompt } from "@/lib/marketing/marketingConsentPrompt";

type PreferenceResponse = {
  hasPreference?: boolean;
  preference?: { marketingEmails: boolean };
  error?: string;
};

type PromptState = "idle" | "checking" | "visible" | "hidden";

export default function MarketingConsentPrompt() {
  const t = useTranslations("auth.marketingPrompt");
  const pathname = usePathname();
  const { status: sessionStatus } = useSession();
  const [hasPreference, setHasPreference] = useState<boolean | null>(null);
  const [state, setState] = useState<PromptState>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      setHasPreference(null);
      setState("hidden");
      return;
    }

    if (/(^|\/)authenticate(?:\/|$)/.test(pathname ?? "")) {
      setState("hidden");
      return;
    }

    const controller = new AbortController();
    setState("checking");

    void fetch("/api/marketing/preferences", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | PreferenceResponse
          | null;

        if (!response.ok || typeof payload?.hasPreference !== "boolean") {
          throw new Error(payload?.error || t("loadError"));
        }

        setHasPreference(payload.hasPreference);
        setState(
          shouldShowMarketingConsentPrompt({
            sessionStatus,
            pathname,
            hasPreference: payload.hasPreference,
          })
            ? "visible"
            : "hidden",
        );
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        console.error("[marketing-consent-prompt] load failed", caught);
        setState("hidden");
      });

    return () => controller.abort();
  }, [pathname, sessionStatus, t]);

  async function saveChoice(marketingEmails: boolean) {
    if (saving) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/marketing/preferences", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketingEmails,
          source: "post_auth_prompt",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | PreferenceResponse
        | null;

      if (!response.ok || !payload?.preference) {
        throw new Error(payload?.error || t("saveError"));
      }

      setHasPreference(true);
      setState("hidden");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (state !== "visible" || hasPreference !== false) return null;

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <section
        aria-describedby="marketing-consent-description"
        aria-labelledby="marketing-consent-title"
        aria-modal="true"
        className="ui-page-surface w-full max-w-md overflow-hidden shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start gap-3 border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.76)] p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300">
            <Mail aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <div className="ui-kicker">{t("eyebrow")}</div>
            <h2 id="marketing-consent-title" className="ui-title-md mt-1">
              {t("title")}
            </h2>
          </div>
        </div>

        <div className="grid gap-4 p-5">
          <p id="marketing-consent-description" className="ui-meta leading-relaxed">
            {t("description")}
          </p>

          <div className="ui-surface-soft px-4 py-3 text-[12px] leading-relaxed text-[rgb(var(--ui-text-muted)/0.95)]">
            {t("optionalNote")}
          </div>

          {error ? (
            <div aria-live="polite" className="ui-surface-danger px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="ui-btn-secondary justify-center"
              disabled={saving}
              onClick={() => void saveChoice(false)}
            >
              {saving ? t("saving") : t("decline")}
            </button>
            <button
              type="button"
              className="ui-btn-primary justify-center"
              disabled={saving}
              onClick={() => void saveChoice(true)}
            >
              {saving ? t("saving") : t("accept")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
