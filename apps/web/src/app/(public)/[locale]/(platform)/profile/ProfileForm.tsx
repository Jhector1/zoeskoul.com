// src/app/profile/ProfileForm.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {ROUTES} from "@/utils";

type Me = {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
};

type SaveResponse = { user: Me };

function cn(...cls: Array<string | false | undefined | null>) {
    return cls.filter(Boolean).join(" ");
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw Object.assign(new Error(data?.error ?? "Request failed"), { data, status: res.status });
    }
    return data as T;
}

function isValidHttpUrl(s: string) {
    try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

function initialsFrom(name?: string | null, email?: string | null) {
    const base = (name ?? "").trim() || (email ?? "").trim();
    if (!base) return "U";
    const parts = base.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join("").toUpperCase();
}

export default function ProfileForm({ initialUser }: { initialUser: Me }) {
    const { data: session, status: sessionStatus, update } = useSession();

    const baseline = useMemo(
        () => ({
            name: (initialUser.name ?? "").trim(),
            image: (initialUser.image ?? "").trim(),
            email: (initialUser.email ?? session?.user?.email ?? "").trim(),
        }),
        [initialUser.name, initialUser.image, initialUser.email, session?.user?.email]
    );

    const [name, setName] = useState(baseline.name);
    const [image, setImage] = useState(baseline.image);

    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    // If server page revalidated with a different user, sync form.
    useEffect(() => {
        setName(baseline.name);
        setImage(baseline.image);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialUser.id]);

    useEffect(() => {
        if (!msg) return;
        const t = setTimeout(() => setMsg(null), 2500);
        return () => clearTimeout(t);
    }, [msg]);

    const email = baseline.email;

    const trimmedName = name.trim();
    const trimmedImage = image.trim();

    const nameError =
        trimmedName.length === 0
            ? "Display name is required."
            : trimmedName.length > 60
                ? "Display name must be 60 characters or fewer."
                : null;

    const imageError =
        trimmedImage.length === 0
            ? null
            : !isValidHttpUrl(trimmedImage)
                ? "Avatar must be a valid http(s) URL."
                : trimmedImage.length > 400
                    ? "Avatar URL is too long."
                    : null;

    const formError = nameError || imageError;

    const dirty = trimmedName !== baseline.name || trimmedImage !== baseline.image;

    const canSave = !saving && dirty && !formError;

    const previewImage =
        (trimmedImage && isValidHttpUrl(trimmedImage) ? trimmedImage : null) ??
        (baseline.image && isValidHttpUrl(baseline.image) ? baseline.image : null) ??
        (typeof session?.user?.image === "string" && isValidHttpUrl(session.user.image) ? session.user.image : null);

    function onReset() {
        setErr(null);
        setMsg(null);
        setName(baseline.name);
        setImage(baseline.image);
    }

    async function onSave() {
        setSaving(true);
        setErr(null);
        setMsg(null);

        try {
            const payload = {
                name: trimmedName,
                image: trimmedImage ? trimmedImage : null,
            };

            const out = await jsonFetch<SaveResponse>("/api/profile", {
                method: "PUT",
                body: JSON.stringify(payload),
            });

            // Refresh NextAuth session so header/avatar updates immediately
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
            {/* Main profile card */}
            <div className="ui-card overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b border-neutral-200 p-5 dark:border-white/10">
                    <div>
                        <div className="text-base font-black text-neutral-900 dark:text-white">Profile</div>
                        <div className="mt-1 text-xs font-semibold text-neutral-600 dark:text-white/65">
                            This appears on certificates, progress screens, and account UI.
                        </div>
                    </div>

                    {/* Avatar preview */}
                    <div className="shrink-0">
                        <div className="h-11 w-11 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none grid place-items-center">
                            {previewImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={previewImage}
                                    alt="Avatar"
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <span className="text-[12px] font-black text-neutral-700 dark:text-white/80">
                  {initialsFrom(trimmedName, email)}
                </span>
                            )}
                        </div>
                    </div>
                </div>

                <form
                    className="grid gap-4 p-5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (canSave) onSave();
                    }}
                >
                    {/* Display name */}
                    <div className="grid gap-2">
                        <label className="text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                            Display name
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                            className={cn("ui-search-input", nameError && "border-rose-300/60 dark:border-rose-300/30")}
                            aria-invalid={!!nameError}
                        />
                        <div className="flex items-center justify-between gap-3">
                            <div className={cn("text-[11px] font-semibold", nameError ? "text-rose-700 dark:text-rose-200/85" : "text-neutral-500 dark:text-white/50")}>
                                {nameError ? nameError : "Used across Learnoir."}
                            </div>
                            <div className="text-[11px] font-semibold text-neutral-400 dark:text-white/35 tabular-nums">
                                {trimmedName.length}/60
                            </div>
                        </div>
                    </div>

                    {/* Email (read-only) */}
                    <div className="grid gap-2">
                        <label className="text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                            Email
                        </label>
                        <div className="ui-soft px-4 py-3 text-sm font-extrabold text-neutral-700 dark:text-white/75">
                            {email || "—"}
                        </div>
                    </div>

                    {/* Avatar URL */}
                    <div className="grid gap-2">
                        <label className="text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                            Avatar URL (optional)
                        </label>
                        <input
                            value={image}
                            onChange={(e) => setImage(e.target.value)}
                            placeholder="https://..."
                            className={cn("ui-search-input", imageError && "border-rose-300/60 dark:border-rose-300/30")}
                            aria-invalid={!!imageError}
                        />
                        <div className={cn("text-[11px] font-semibold", imageError ? "text-rose-700 dark:text-rose-200/85" : "text-neutral-500 dark:text-white/50")}>
                            {imageError ? imageError : "Tip: Square images look best."}
                        </div>
                    </div>

                    {/* Status */}
                    <div aria-live="polite" className="grid gap-2">
                        {err ? (
                            <div className="ui-soft border-rose-300/40 bg-rose-50 text-rose-800 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-100 px-4 py-3 text-[12px] font-extrabold">
                                {err}
                            </div>
                        ) : null}

                        {msg ? (
                            <div className="ui-soft border-emerald-300/40 bg-emerald-50 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-50 px-4 py-3 text-[12px] font-extrabold">
                                {msg}
                            </div>
                        ) : null}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="text-[12px] font-semibold text-neutral-500 dark:text-white/45">
                            {sessionStatus === "loading" ? "Syncing…" : dirty ? "Unsaved changes" : "Up to date"}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onReset}
                                disabled={saving || !dirty}
                                className={cn("ui-btn ui-btn-secondary", (saving || !dirty) && "opacity-60 cursor-not-allowed")}
                            >
                                Reset
                            </button>

                            <button
                                type="submit"
                                disabled={!canSave}
                                className={cn("ui-btn ui-btn-primary", !canSave && "opacity-60 cursor-not-allowed")}
                                title={formError ? formError : !dirty ? "No changes to save" : undefined}
                            >
                                {saving ? "Saving…" : "Save changes"}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Billing card */}
            <Link href="/billing" className="ui-card p-5 hover:shadow-md transition">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-black text-neutral-900 dark:text-white">Billing</div>
                        <div className="mt-1 text-xs font-semibold text-neutral-600 dark:text-white/65">
                            Manage subscription, invoices, and payment method.
                        </div>
                    </div>
                    <div className="text-neutral-500 dark:text-white/60">→</div>
                </div>
            </Link>

            {/* Optional polish link */}
            <Link href={ROUTES.achievements} className="ui-card p-5 hover:shadow-md transition">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-black text-neutral-900 dark:text-white">Account</div>
                        <div className="mt-1 text-xs font-semibold text-neutral-600 dark:text-white/65">
                            Certificates, security, and data export.
                        </div>
                    </div>
                    <div className="text-neutral-500 dark:text-white/60">→</div>
                </div>
            </Link>
        </div>
    );
}