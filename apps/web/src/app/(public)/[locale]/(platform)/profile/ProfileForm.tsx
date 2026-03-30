"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ROUTES } from "@/utils";

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
        throw Object.assign(new Error(data?.error ?? "Request failed"), {
            data,
            status: res.status,
        });
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

function FieldLabel({ children }: { children: React.ReactNode }) {
    return <label className="ui-meta-strong">{children}</label>;
}

function StatusNotice({
                          tone,
                          children,
                      }: {
    tone: "success" | "danger";
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "px-4 py-3 text-[12px] font-medium",
                tone === "success" ? "ui-surface-success" : "ui-surface-danger",
            )}
        >
            {children}
        </div>
    );
}

function NavCard({
                     href,
                     title,
                     description,
                 }: {
    href: string;
    title: string;
    description: string;
}) {
    return (
        <Link
            href={href}
            className="ui-page-surface flex items-center justify-between gap-3 p-5 transition-colors hover:border-[rgb(var(--ui-border-strong)/1)] hover:bg-[rgb(var(--ui-surface)/1)]"
        >
            <div>
                <div className="ui-title-sm">{title}</div>
                <div className="mt-1 ui-meta">{description}</div>
            </div>
            <div className="ui-meta-strong">→</div>
        </Link>
    );
}

export default function ProfileForm({ initialUser }: { initialUser: Me }) {
    const { data: session, status: sessionStatus, update } = useSession();

    const baseline = useMemo(
        () => ({
            name: (initialUser.name ?? "").trim(),
            image: (initialUser.image ?? "").trim(),
            email: (initialUser.email ?? session?.user?.email ?? "").trim(),
        }),
        [initialUser.name, initialUser.image, initialUser.email, session?.user?.email],
    );

    const [name, setName] = useState(baseline.name);
    const [image, setImage] = useState(baseline.image);

    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        setName(baseline.name);
        setImage(baseline.image);
    }, [initialUser.id, baseline.name, baseline.image]);

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
        (typeof session?.user?.image === "string" && isValidHttpUrl(session.user.image)
            ? session.user.image
            : null);

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
            <div className="ui-page-surface overflow-hidden">
                <div className="flex items-start justify-between gap-4 border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] p-5">
                    <div>
                        <div className="ui-title-sm">Profile</div>
                        <div className="mt-1 ui-meta">
                            This appears on certificates, progress screens, and account UI.
                        </div>
                    </div>

                    <div className="shrink-0">
                        <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg border border-[rgb(var(--ui-border)/1)] bg-[rgb(var(--ui-surface)/1)]">
                            {previewImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={previewImage}
                                    alt="Avatar"
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <span className="text-[12px] font-medium text-[rgb(var(--ui-text)/0.92)]">
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
                    <div className="grid gap-2">
                        <FieldLabel>Display name</FieldLabel>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                            className={cn(
                                "ui-search-input",
                                nameError && "border-rose-300/60 dark:border-rose-300/30",
                            )}
                            aria-invalid={!!nameError}
                        />
                        <div className="flex items-center justify-between gap-3">
                            <div
                                className={cn(
                                    "text-[11px] font-medium",
                                    nameError
                                        ? "text-rose-700 dark:text-rose-200/85"
                                        : "text-[rgb(var(--ui-text-muted)/0.84)]",
                                )}
                            >
                                {nameError ? nameError : "Used across Learnoir."}
                            </div>
                            <div className="tabular-nums text-[11px] font-medium text-[rgb(var(--ui-text-soft)/0.82)]">
                                {trimmedName.length}/60
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <FieldLabel>Email</FieldLabel>
                        <div className="ui-surface-soft px-4 py-3 text-sm font-medium text-[rgb(var(--ui-text)/0.88)]">
                            {email || "—"}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <FieldLabel>Avatar URL (optional)</FieldLabel>
                        <input
                            value={image}
                            onChange={(e) => setImage(e.target.value)}
                            placeholder="https://..."
                            className={cn(
                                "ui-search-input",
                                imageError && "border-rose-300/60 dark:border-rose-300/30",
                            )}
                            aria-invalid={!!imageError}
                        />
                        <div
                            className={cn(
                                "text-[11px] font-medium",
                                imageError
                                    ? "text-rose-700 dark:text-rose-200/85"
                                    : "text-[rgb(var(--ui-text-muted)/0.84)]",
                            )}
                        >
                            {imageError ? imageError : "Tip: Square images look best."}
                        </div>
                    </div>

                    <div aria-live="polite" className="grid gap-2">
                        {err ? <StatusNotice tone="danger">{err}</StatusNotice> : null}
                        {msg ? <StatusNotice tone="success">{msg}</StatusNotice> : null}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="ui-meta">
                            {sessionStatus === "loading"
                                ? "Syncing…"
                                : dirty
                                    ? "Unsaved changes"
                                    : "Up to date"}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onReset}
                                disabled={saving || !dirty}
                                className={cn(
                                    "ui-btn-secondary",
                                    (saving || !dirty) && "cursor-not-allowed opacity-60",
                                )}
                            >
                                Reset
                            </button>

                            <button
                                type="submit"
                                disabled={!canSave}
                                className={cn(
                                    "ui-btn-primary",
                                    !canSave && "cursor-not-allowed opacity-60",
                                )}
                                title={formError ? formError : !dirty ? "No changes to save" : undefined}
                            >
                                {saving ? "Saving…" : "Save changes"}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <NavCard
                href="/billing"
                title="Billing"
                description="Manage subscription, invoices, and payment method."
            />

            <NavCard
                href={ROUTES.achievements}
                title="Account"
                description="Certificates, security, and data export."
            />
        </div>
    );
}