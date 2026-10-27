"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteBuildProjectButton(props: {
  buildProjectId: string; title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    const answer = window.prompt(
      `Permanently delete ${props.title}? This removes project source, revisions, previews recorded in the database, and local store data. Type the exact project name to confirm. Published URLs will stop working. Projects with payment orders, active work or external resources require separate cleanup.`,
    );
    if (answer === null) return;
    if (answer !== props.title) {
      setError("Project name did not match. Nothing was deleted.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/build/projects/${encodeURIComponent(props.buildProjectId)}`, {
        method: "DELETE", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmTitle: answer }),
      });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.message ?? "This project could not be deleted safely.");
      }
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Project deletion failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <button type="button" disabled={busy} onClick={() => void remove()}
        className="rounded-md border border-red-400/50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50">
        {busy ? "Deleting…" : "Delete project"}
      </button>
      {error ? <span role="alert" className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
