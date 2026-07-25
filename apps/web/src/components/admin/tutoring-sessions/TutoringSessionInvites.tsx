"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";

type Invite = {
  id: string;
  email: string;
  invitedUserId: string | null;
  viewedAt: string | Date | null;
  expiresAt: string | Date;
  sentAt: string | Date | null;
  acceptedAt: string | Date | null;
  declinedAt: string | Date | null;
  revokedAt: string | Date | null;
  emailStatus: "NOT_SENT" | "SENT" | "FAILED";
  emailLastAttemptAt: string | Date | null;
  emailError: string | null;
};

function lifecycleLabel(invite: Invite) {
  if (invite.revokedAt) return "Cancelled";
  if (invite.acceptedAt) return "Accepted";
  if (invite.declinedAt) return "Declined";
  if (new Date(invite.expiresAt) <= new Date()) return "Expired";
  if (invite.viewedAt) return "Viewed";
  return "Invited";
}

function emailLabel(invite: Invite) {
  if (invite.emailStatus === "SENT") return "Email sent";
  if (invite.emailStatus === "FAILED") return "Email failed";
  return "Email not sent";
}

export default function TutoringSessionInvites({
  invites,
  endpoint,
  enabled,
  disabledMessage,
  onNotice,
  onError,
  onCancelled,
}: {
  invites: Invite[];
  endpoint: string;
  enabled: boolean;
  disabledMessage: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onCancelled?: (email: string) => void;
}) {
  const locale = useLocale() as "en" | "es" | "fr" | "ht";
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (!invites.length) return null;

  async function act(email: string, action: "link" | "email" | "cancel") {
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
        let fallback = "";
        if (typeof json.inviteUrl === "string" && json.inviteUrl) {
          try {
            await navigator.clipboard.writeText(json.inviteUrl);
            fallback = " The invitation link was copied so you can send it manually.";
          } catch {
            fallback = " Copy the invitation link and send it manually.";
          }
        }
        throw new Error(`${json.error ?? "Could not update invitation."}${fallback}`);
      }
      if (action === "link") {
        await navigator.clipboard.writeText(json.inviteUrl);
        onNotice(`Invitation link copied for ${email}.`);
      } else if (action === "email") {
        onNotice(`Invitation email accepted for delivery to ${email}.`);
      } else {
        onCancelled?.(email);
        onNotice(`Invitation cancelled for ${email}.`);
      }
      router.refresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not update invitation.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 lg:col-span-2">
      <div>
        <h2 className="font-semibold">Student invitations</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Every email uses one invitation record for in-app visibility, email delivery, copied links, and acceptance.
        </p>
      </div>
      {!enabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {disabledMessage}
        </div>
      ) : null}
      <div className="grid gap-3">
        {invites.map((invite) => {
          const lifecycle = lifecycleLabel(invite);
          const canDeliver = !invite.acceptedAt && !invite.revokedAt;
          const canCancel = canDeliver;
          return (
            <div key={invite.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{invite.email}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className="ui-badge">{lifecycle}</span>
                    <span className="ui-badge">{emailLabel(invite)}</span>
                    {invite.invitedUserId ? <span className="ui-badge">Existing account</span> : null}
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">
                    Expires {new Date(invite.expiresAt).toLocaleString()}
                    {invite.sentAt
                      ? ` · Last emailed ${new Date(invite.sentAt).toLocaleString()}`
                      : invite.emailLastAttemptAt
                        ? ` · Last attempted ${new Date(invite.emailLastAttemptAt).toLocaleString()}`
                        : ""}
                  </div>
                  {invite.emailStatus === "FAILED" && invite.emailError ? (
                    <div className="mt-1 text-xs text-red-700">{invite.emailError}</div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium disabled:opacity-50"
                    disabled={Boolean(busy) || !enabled || !canDeliver}
                    onClick={() => act(invite.email, "link")}
                  >
                    {busy === `link:${invite.email}` ? "Creating…" : "Copy invitation link"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    disabled={Boolean(busy) || !enabled || !canDeliver}
                    onClick={() => act(invite.email, "email")}
                  >
                    {busy === `email:${invite.email}` ? "Sending…" : "Resend email"}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50"
                    disabled={Boolean(busy) || !canCancel}
                    onClick={() => act(invite.email, "cancel")}
                  >
                    {busy === `cancel:${invite.email}` ? "Cancelling…" : "Cancel invitation"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
