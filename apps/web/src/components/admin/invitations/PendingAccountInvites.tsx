"use client";

import { useState } from "react";
import { useLocale } from "next-intl";

type PendingInvite = {
  id: string;
  email: string;
  expiresAt: string | Date;
  sentAt: string | Date | null;
};

export default function PendingAccountInvites({
  invites,
  endpoint,
  enabled,
  disabledMessage,
  description,
  onNotice,
  onError,
}: {
  invites: PendingInvite[];
  endpoint: string;
  enabled: boolean;
  disabledMessage: string;
  description: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const locale = useLocale();
  const [busy, setBusy] = useState<string | null>(null);

  if (!invites.length) return null;

  async function deliver(email: string, action: "link" | "email") {
    setBusy(`${action}:${email}`);
    onError("");
    onNotice("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, action, locale }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error ?? "Could not create invitation.");
      }

      if (action === "link") {
        await navigator.clipboard.writeText(json.inviteUrl);
        onNotice(`Invitation link copied for ${email}.`);
      } else if (json.delivery === "email") {
        onNotice(`Invitation email sent to ${email}.`);
      } else {
        await navigator.clipboard.writeText(json.inviteUrl);
        onNotice(`Invitation link copied. Your email app is opening for ${email}.`);
        window.location.href = json.mailtoHref;
      }
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "Could not create invitation.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-5 lg:col-span-2">
      <div>
        <h2 className="font-semibold">Pending account invitations</h2>
        <p className="mt-1 text-sm text-neutral-600">{description}</p>
      </div>
      {!enabled ? (
        <div className="rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-800">
          {disabledMessage}
        </div>
      ) : null}
      <div className="grid gap-3">
        {invites.map((invite) => {
          const copyBusy = busy === `link:${invite.email}`;
          const emailBusy = busy === `email:${invite.email}`;
          return (
            <div
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3"
            >
              <div>
                <div className="text-sm font-medium">{invite.email}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  Link expires {new Date(invite.expiresAt).toLocaleString()}
                  {invite.sentAt
                    ? ` · Last emailed ${new Date(invite.sentAt).toLocaleString()}`
                    : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium disabled:opacity-50"
                  disabled={Boolean(busy) || !enabled}
                  onClick={() => deliver(invite.email, "link")}
                >
                  {copyBusy ? "Creating…" : "Copy invite link"}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                  disabled={Boolean(busy) || !enabled}
                  onClick={() => deliver(invite.email, "email")}
                >
                  {emailBusy ? "Sending…" : "Email invite"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
