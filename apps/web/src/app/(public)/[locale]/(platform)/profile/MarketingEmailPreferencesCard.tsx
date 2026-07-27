"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

type MarketingPreference = {
  marketingEmails: boolean;
  consentAt: string | null;
  consentSource: string | null;
  declinedAt: string | null;
  unsubscribedAt: string | null;
  provider: "brevo" | "beehiiv" | null;
  syncStatus: string | null;
  syncedAt: string | null;
};

type MarketingPreferenceResponse = {
  preference: MarketingPreference;
  syncStatus?: "synced" | "pending" | "not_configured";
  error?: string;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function providerLabel(provider: MarketingPreference["provider"]) {
  if (provider === "brevo") return "Brevo";
  if (provider === "beehiiv") return "Beehiiv";
  return "newsletter provider";
}

function savedStatusLabel(preference: MarketingPreference) {
  if (!preference.marketingEmails) return "Not subscribed";
  if (preference.syncStatus === "active") {
    return `Subscribed through ${providerLabel(preference.provider)}`;
  }
  if (preference.syncStatus === "not_configured") {
    return "Opt-in saved · Provider not configured";
  }
  if (preference.syncStatus === "error") {
    return "Opt-in saved · Sync needs attention";
  }
  return "Opt-in saved · Sync pending";
}

export default function MarketingEmailPreferencesCard({
  initialPreference,
}: {
  initialPreference: MarketingPreference;
}) {
  const [preference, setPreference] = useState(initialPreference);
  const [enabled, setEnabled] = useState(initialPreference.marketingEmails);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = preference.marketingEmails !== enabled;

  async function savePreference() {
    if (!dirty || saving) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/marketing/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketingEmails: enabled }),
      });
      const payload = (await response.json().catch(() => null)) as
        | MarketingPreferenceResponse
        | null;

      if (!response.ok || !payload?.preference) {
        throw new Error(payload?.error || "Could not update email preferences.");
      }

      setPreference(payload.preference);
      setEnabled(payload.preference.marketingEmails);

      if (!payload.preference.marketingEmails) {
        setMessage(
          payload.syncStatus === "synced"
            ? "You are unsubscribed from ZoeSkoul marketing emails."
            : "Your ZoeSkoul opt-out is saved. Provider removal is still pending.",
        );
      } else if (payload.syncStatus === "synced") {
        setMessage(
          `You are subscribed to new-course and product updates through ${providerLabel(payload.preference.provider)}.`,
        );
      } else if (payload.syncStatus === "not_configured") {
        setMessage(
          "Your opt-in is saved. Configure the active marketing provider to enable newsletter delivery.",
        );
      } else {
        setMessage(
          `Your opt-in is saved, but ${providerLabel(payload.preference.provider)} synchronization is still pending.`,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update email preferences.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="ui-page-surface overflow-hidden">
      <div className="flex items-start gap-3 border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300">
          <Mail aria-hidden="true" className="h-[18px] w-[18px]" />
        </span>
        <div>
          <div className="ui-title-sm">Email updates</div>
          <div className="mt-1 ui-meta">
            Control optional announcements about new courses, features, and learning resources.
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--ui-border)/0.85)] bg-[rgb(var(--ui-surface)/0.55)] p-4">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setEnabled(event.target.checked);
              setMessage(null);
              setError(null);
            }}
            disabled={saving}
            className="mt-0.5 h-4 w-4 rounded border-[rgb(var(--ui-border-strong)/1)] text-[rgb(var(--ui-accent)/1)] focus:ring-[rgb(var(--ui-accent)/0.35)]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[rgb(var(--ui-text)/0.94)]">
              Send me ZoeSkoul news and new-course announcements
            </span>
            <span className="ui-meta mt-1 block leading-relaxed">
              This is optional. You can unsubscribe at any time without affecting your account.
            </span>
          </span>
        </label>

        <div className="ui-surface-soft px-4 py-3 text-[12px] leading-relaxed text-[rgb(var(--ui-text-muted)/0.95)]">
          Verification, password reset, receipts, course assignments, tutoring invitations, and security messages are transactional emails and remain separate from this preference.
        </div>

        <div aria-live="polite" className="grid gap-2">
          {error ? (
            <div className="ui-surface-danger rounded-lg px-4 py-3 text-[12px] font-medium">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="ui-surface-success rounded-lg px-4 py-3 text-[12px] font-medium">
              {message}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="ui-meta">
            {dirty ? "Unsaved changes" : savedStatusLabel(preference)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEnabled(preference.marketingEmails);
                setMessage(null);
                setError(null);
              }}
              disabled={!dirty || saving}
              className={cn(
                "ui-btn-secondary",
                (!dirty || saving) && "cursor-not-allowed opacity-60",
              )}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => void savePreference()}
              disabled={!dirty || saving}
              className={cn(
                "ui-btn-primary",
                (!dirty || saving) && "cursor-not-allowed opacity-60",
              )}
            >
              {saving ? "Saving…" : "Save preference"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
