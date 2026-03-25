"use client";

import React, { useMemo, useState } from "react";

type SeedResult =
  | { ok: true; modules: number; sections: number; ms: number }
  | { ok: false; error: string };

export default function SeedAdminPage() {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);

  const status = useMemo(() => {
    if (!result) return null;
    if (result.ok) return { kind: "success" as const, text: "Synced successfully." };
    return { kind: "error" as const, text: result.error || "Seed failed." };
  }, [result]);

  async function run() {
    if (loading) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/seed", { method: "POST" });
      const json = (await res.json()) as SeedResult;

      if (!res.ok) {
        setResult({ ok: false, error: (json as any)?.error ?? `Request failed (${res.status})` });
      } else {
        setResult(json);
      }
    } catch (e: any) {
      setResult({ ok: false, error: e?.message ?? "Network error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Sync Reference Data</h1>
      <p className="mt-2 text-sm text-neutral-600">
        This will <span className="font-medium">upsert</span> practice modules + sections into the production DB.
        Safe to run multiple times.
      </p>

      <div className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <input
            id="confirm"
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
          />
          <label htmlFor="confirm" className="text-sm">
            I understand this will write reference data to the database.
          </label>
        </div>

        <button
          onClick={run}
          disabled={!confirm || loading}
          className={[
            "mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium",
            "border shadow-sm transition",
            loading || !confirm
              ? "cursor-not-allowed bg-neutral-100 text-neutral-400"
              : "bg-black text-white hover:opacity-90",
          ].join(" ")}
        >
          {loading && (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {loading ? "Syncing…" : "Sync now"}
        </button>

        {status && (
          <div
            className={[
              "mt-4 rounded-xl border p-3 text-sm",
              status.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800",
            ].join(" ")}
          >
            {status.text}
          </div>
        )}

        {result?.ok && (
          <div className="mt-4 rounded-xl border bg-neutral-50 p-3 text-sm text-neutral-700">
            <div className="font-medium">Result</div>
            <div className="mt-1">
              Modules: <span className="font-mono">{result.modules}</span>
              {" · "}
              Sections: <span className="font-mono">{result.sections}</span>
              {" · "}
              Time: <span className="font-mono">{result.ms}ms</span>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-neutral-500">
        Run this after deploying updates to <code className="font-mono">prisma/seed/data.ts</code>.
      </p>
    </div>
  );
}
