"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const field = "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200";

export default function LearningGroupEditor({ initialGroup }: { initialGroup: any | null }) {
  const router = useRouter();
  const isNew = !initialGroup;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState({
    name: initialGroup?.name ?? "",
    slug: initialGroup?.slug ?? "",
    description: initialGroup?.description ?? "",
    memberEmails: (initialGroup?.members ?? []).map((row: any) => row.user.email).filter(Boolean).join("\n"),
  });

  async function save() {
    setBusy(true); setError(null);
    const payload = {
      ...state,
      slug: state.slug || slugify(state.name),
      description: state.description || null,
      memberEmails: [
        ...new Set(
          state.memberEmails
            .split(/[\n,;]+/)
            .map((value: string) => value.trim().toLowerCase())
            .filter(Boolean),
        ),
      ],
    };
    const response = await fetch(isNew ? "/api/admin/learning-groups" : `/api/admin/learning-groups/${initialGroup.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(`${json.error ?? "Could not save group."}${json.missingEmails?.length ? ` Missing: ${json.missingEmails.join(", ")}` : ""}`);
      setBusy(false); return;
    }
    router.replace(`/admin/learning-groups/${json.group.id}`); router.refresh(); setBusy(false);
  }

  async function destroy() {
    if (!initialGroup || !confirm("Delete this student group?")) return;
    setBusy(true);
    const response = await fetch(`/api/admin/learning-groups/${initialGroup.id}`, { method: "DELETE" });
    if (response.ok) { router.replace("/admin/learning-groups"); router.refresh(); return; }
    setBusy(false); setError("Could not delete group.");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">{isNew ? "New student group" : "Edit student group"}</h1><p className="mt-1 text-sm text-neutral-500">Groups only own audience membership; courses and progress remain shared.</p></div>
        <div className="flex gap-2">{!isNew ? <button onClick={destroy} disabled={busy} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700">Delete</button> : null}<button onClick={save} disabled={busy} className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button></div>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
        <label className="block text-xs font-medium text-neutral-600">Name<input className={field} value={state.name} onChange={(event) => setState((current) => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} /></label>
        <label className="block text-xs font-medium text-neutral-600">Slug<input className={field} value={state.slug} onChange={(event) => setState((current) => ({ ...current, slug: event.target.value }))} /></label>
        <label className="block text-xs font-medium text-neutral-600">Description<textarea className={field} rows={3} value={state.description} onChange={(event) => setState((current) => ({ ...current, description: event.target.value }))} /></label>
        <label className="block text-xs font-medium text-neutral-600">Student emails<textarea className={field} rows={10} value={state.memberEmails} onChange={(event) => setState((current) => ({ ...current, memberEmails: event.target.value }))} /><span className="mt-1 block text-[11px] text-neutral-500">One existing ZoeSkoul account email per line.</span></label>
      </div>
    </div>
  );
}
