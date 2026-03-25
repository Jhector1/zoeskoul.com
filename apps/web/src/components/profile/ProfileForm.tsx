"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type Me = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

function cn(...cls: Array<string | false | undefined | null>) {
  return cls.filter(Boolean).join(" ");
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error ?? "Request failed"), { data, status: res.status });
  return data as T;
}

export default function ProfileForm({ initialUser }: { initialUser: Me }) {
  const { data: session, update } = useSession();

  const [name, setName] = useState(initialUser.name ?? "");
  const [image, setImage] = useState(initialUser.image ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const email = useMemo(() => initialUser.email ?? session?.user?.email ?? "", [initialUser.email, session?.user?.email]);

  useEffect(() => {
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  async function onSave() {
    setSaving(true);
    setErr(null);
    setMsg(null);

    try {
      const payload = {
        name: name.trim(),
        image: image.trim() ? image.trim() : null,
      };

      const out = await jsonFetch<{ user: Me }>("/api/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      // Refresh NextAuth session so Header dropdown updates immediately
      await update?.({
        name: out.user.name ?? undefined,
        image: out.user.image ?? undefined,
      });

      setMsg("Profile updated");
    } catch (e: any) {
      const firstIssue =
        e?.data?.issues?.fieldErrors?.name?.[0] ||
        e?.data?.issues?.fieldErrors?.image?.[0];
      setErr(firstIssue || e?.message || "Could not update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-white/10 bg-black/45 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <div className="text-lg font-black tracking-tight text-white/90">Profile</div>
          <div className="text-[12px] text-white/55 mt-1">
            Update your public info used across Learnoir.
          </div>
        </div>

        <div className="p-5 grid gap-4">
          {/* Name */}
          <div className="grid gap-2">
            <label className="text-[11px] font-extrabold text-white/60">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className={cn(
                "w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3",
                "text-sm font-semibold text-white/85 placeholder:text-white/30",
                "focus:outline-none focus:ring-2 focus:ring-white/15"
              )}
            />
          </div>

          {/* Email (read-only) */}
          <div className="grid gap-2">
            <label className="text-[11px] font-extrabold text-white/60">Email</label>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/55">
              {email || "—"}
            </div>
          </div>

          {/* Avatar */}
          <div className="grid gap-2">
            <label className="text-[11px] font-extrabold text-white/60">Avatar URL (optional)</label>
            <input
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://..."
              className={cn(
                "w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3",
                "text-sm font-semibold text-white/85 placeholder:text-white/30",
                "focus:outline-none focus:ring-2 focus:ring-white/15"
              )}
            />
            <div className="text-[11px] text-white/45">
              Tip: Use a square image for best results.
            </div>
          </div>

          {/* Status */}
          {err ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-[12px] font-semibold text-rose-100">
              {err}
            </div>
          ) : null}

          {msg ? (
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-[12px] font-semibold text-emerald-50">
              {msg}
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className={cn(
                "rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3",
                "text-sm font-extrabold text-white/90 hover:bg-emerald-300/15 active:translate-y-[1px]",
                saving && "opacity-60 cursor-not-allowed"
              )}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Billing card */}
      <a
        href="/billing"
        className="group rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-4 backdrop-blur-xl
                   shadow-[0_18px_60px_rgba(0,0,0,0.35)] hover:bg-white/[0.08] transition"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-white/90">Billing</div>
            <div className="mt-1 text-[12px] text-white/55">
              Manage subscription, invoices, and payment method.
            </div>
          </div>
          <div className="text-white/60 group-hover:text-white/80 transition">→</div>
        </div>
      </a>
    </div>
  );
}
