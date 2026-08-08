"use client";

import { useState } from "react";
import { useRouter } from "@student/i18n/navigation";

export default function TutoringInvitationActions({
  invitationId,
  sessionId,
  canAccept = true,
  compact = false,
}: {
  invitationId: string;
  sessionId: string;
  canAccept?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "accept" | "decline") {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/tutoring-invitations/${invitationId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error ?? "Could not update the invitation.");
      }
      if (action === "accept") {
        router.push(`/tutoring-sessions/${json.sessionId ?? sessionId}`);
      } else {
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the invitation.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={compact ? "mt-4" : "space-y-3"}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          disabled={Boolean(busy) || !canAccept}
          onClick={() => respond("accept")}
        >
          {busy === "accept" ? "Accepting…" : canAccept ? "Accept invitation" : "Waiting for tutor"}
        </button>
        <button
          type="button"
          className="ui-btn-secondary"
          disabled={Boolean(busy)}
          onClick={() => respond("decline")}
        >
          {busy === "decline" ? "Declining…" : "Decline"}
        </button>
      </div>
      {error ? <div className="mt-2 text-sm text-red-700">{error}</div> : null}
    </div>
  );
}
