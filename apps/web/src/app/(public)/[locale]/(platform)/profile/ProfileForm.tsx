"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
    ArrowRight,
    Award,
    BookOpen,
    Camera,
    Clipboard,
    CreditCard,
    Dumbbell,
    ImagePlus,
    LayoutDashboard,
    MessageCircle,
    Trash2,
    Trophy,
    Users,
    type LucideIcon,
} from "lucide-react";
import {
    profileRoleLabel,
    resolveProfileNavigation,
    type ProfileNavigationIcon,
    type ProfileNavigationSection,
    type ProfileWorkspaceRole,
} from "@/lib/profile/profileNavigation";
import {
    PROFILE_AVATAR_ACCEPT,
    profileAvatarFileError,
} from "@/lib/profile/profileAvatar";

type Me = {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
};

type SavedProfile = {
    name: string;
    email: string;
    image: string;
};

type SaveResponse = { user: Me };

function cn(...cls: Array<string | false | undefined | null>) {
    return cls.filter(Boolean).join(" ");
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const usesFormData = init?.body instanceof FormData;
    const res = await fetch(url, {
        ...init,
        headers: usesFormData
            ? init?.headers
            : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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
                "rounded-lg px-4 py-3 text-[12px] font-medium",
                tone === "success" ? "ui-surface-success" : "ui-surface-danger",
            )}
        >
            {children}
        </div>
    );
}

const navigationIcons: Record<ProfileNavigationIcon, LucideIcon> = {
    book: BookOpen,
    message: MessageCircle,
    award: Award,
    clipboard: Clipboard,
    users: Users,
    dashboard: LayoutDashboard,
    practice: Dumbbell,
    trophy: Trophy,
    billing: CreditCard,
};

const navigationIconStyles: Record<ProfileNavigationIcon, string> = {
    book: "border-sky-500/25 bg-sky-500/10 text-sky-600 group-hover:bg-sky-500/15 dark:text-sky-300",
    message: "border-violet-500/25 bg-violet-500/10 text-violet-600 group-hover:bg-violet-500/15 dark:text-violet-300",
    award: "border-amber-500/25 bg-amber-500/10 text-amber-600 group-hover:bg-amber-500/15 dark:text-amber-300",
    clipboard: "border-cyan-500/25 bg-cyan-500/10 text-cyan-600 group-hover:bg-cyan-500/15 dark:text-cyan-300",
    users: "border-indigo-500/25 bg-indigo-500/10 text-indigo-600 group-hover:bg-indigo-500/15 dark:text-indigo-300",
    dashboard: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500/15 dark:text-emerald-300",
    practice: "border-rose-500/25 bg-rose-500/10 text-rose-600 group-hover:bg-rose-500/15 dark:text-rose-300",
    trophy: "border-orange-500/25 bg-orange-500/10 text-orange-600 group-hover:bg-orange-500/15 dark:text-orange-300",
    billing: "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-600 group-hover:bg-fuchsia-500/15 dark:text-fuchsia-300",
};

function NavCard({
                     href,
                     title,
                     description,
                     icon,
                 }: {
    href: string;
    title: string;
    description: string;
    icon: ProfileNavigationIcon;
}) {
    const Icon = navigationIcons[icon];

    return (
        <Link
            href={href}
            className="group flex min-h-[116px] items-start justify-between gap-4 rounded-xl border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.72)] p-4 transition-all hover:-translate-y-0.5 hover:border-[rgb(var(--ui-border-strong)/1)] hover:bg-[rgb(var(--ui-surface)/1)] hover:shadow-sm"
        >
            <div className="flex min-w-0 items-start gap-3.5">
                <span
                    className={cn(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors",
                        navigationIconStyles[icon],
                    )}
                >
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.9} />
                </span>
                <div className="min-w-0 pt-0.5">
                    <div className="ui-title-sm">{title}</div>
                    <div className="mt-1.5 ui-meta leading-relaxed">{description}</div>
                </div>
            </div>
            <ArrowRight
                aria-hidden="true"
                className="mt-1 h-4 w-4 shrink-0 text-[rgb(var(--ui-text-muted)/0.8)] transition-transform group-hover:translate-x-0.5 group-hover:text-[rgb(var(--ui-accent)/1)]"
            />
        </Link>
    );
}

function NavigationSection({ section }: { section: ProfileNavigationSection }) {
    return (
        <section className="ui-page-surface overflow-hidden">
            <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.64)] px-5 py-4">
                <div className="ui-section-kicker">{section.eyebrow}</div>
                <div className="mt-1 ui-title-sm">{section.title}</div>
                <div className="mt-1 ui-meta">{section.description}</div>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {section.items.map((item) => (
                    <NavCard
                        key={item.id}
                        href={item.href}
                        title={item.title}
                        description={item.description}
                        icon={item.icon}
                    />
                ))}
            </div>
        </section>
    );
}

export default function ProfileForm({
    initialUser,
    workspaceRole,
    appName,
}: {
    initialUser: Me;
    workspaceRole: ProfileWorkspaceRole;
    appName: string;
}) {
    const { data: session, status: sessionStatus, update } = useSession();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const navigationSections = useMemo(
        () => resolveProfileNavigation(workspaceRole),
        [workspaceRole],
    );
    const workspaceRoleLabel = profileRoleLabel(workspaceRole);

    const initialProfile = useMemo<SavedProfile>(
        () => ({
            name: (initialUser.name ?? "").trim(),
            image: (initialUser.image ?? "").trim(),
            email: (initialUser.email ?? session?.user?.email ?? "").trim(),
        }),
        [initialUser.name, initialUser.image, initialUser.email, session?.user?.email],
    );

    const [savedProfile, setSavedProfile] = useState(initialProfile);
    const [name, setName] = useState(initialProfile.name);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [removeAvatar, setRemoveAvatar] = useState(false);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        setSavedProfile(initialProfile);
        setName(initialProfile.name);
        setAvatarFile(null);
        setRemoveAvatar(false);
    }, [initialUser.id, initialProfile]);

    useEffect(() => {
        if (!avatarFile) {
            setAvatarPreviewUrl(null);
            return;
        }

        const objectUrl = URL.createObjectURL(avatarFile);
        setAvatarPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [avatarFile]);

    useEffect(() => {
        if (!msg) return;
        const t = setTimeout(() => setMsg(null), 2500);
        return () => clearTimeout(t);
    }, [msg]);

    const trimmedName = name.trim();
    const nameError =
        trimmedName.length === 0
            ? "Display name is required."
            : trimmedName.length > 60
                ? "Display name must be 60 characters or fewer."
                : null;

    const avatarChanged = Boolean(avatarFile) || removeAvatar;
    const dirty = trimmedName !== savedProfile.name || avatarChanged;
    const canSave = !saving && dirty && !nameError;

    const persistedImage =
        savedProfile.image && isValidHttpUrl(savedProfile.image)
            ? savedProfile.image
            : null;
    const previewImage = avatarPreviewUrl ?? (removeAvatar ? null : persistedImage);

    function clearAvatarSelection() {
        setAvatarFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function onChooseAvatar(file: File | null) {
        setErr(null);
        setMsg(null);
        if (!file) return;

        const fileError = profileAvatarFileError(file);
        if (fileError) {
            clearAvatarSelection();
            setErr(fileError);
            return;
        }

        setAvatarFile(file);
        setRemoveAvatar(false);
    }

    function onRemoveAvatar() {
        clearAvatarSelection();
        setRemoveAvatar(true);
        setErr(null);
        setMsg(null);
    }

    function onReset() {
        setErr(null);
        setMsg(null);
        setName(savedProfile.name);
        clearAvatarSelection();
        setRemoveAvatar(false);
    }

    async function onSave() {
        setSaving(true);
        setErr(null);
        setMsg(null);

        try {
            let body: BodyInit;
            if (avatarFile || removeAvatar) {
                const form = new FormData();
                form.set("name", trimmedName);
                form.set("removeImage", removeAvatar ? "true" : "false");
                if (avatarFile) form.set("avatar", avatarFile, avatarFile.name);
                body = form;
            } else {
                body = JSON.stringify({
                    name: trimmedName,
                    image: savedProfile.image || null,
                });
            }

            const out = await apiFetch<SaveResponse>("/api/profile", {
                method: "PUT",
                body,
            });
            const nextProfile: SavedProfile = {
                name: (out.user.name ?? "").trim(),
                email: (out.user.email ?? savedProfile.email).trim(),
                image: (out.user.image ?? "").trim(),
            };

            setSavedProfile(nextProfile);
            setName(nextProfile.name);
            clearAvatarSelection();
            setRemoveAvatar(false);

            await update?.({
                name: out.user.name ?? undefined,
                image: out.user.image ?? null,
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
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="ui-title-sm">Profile</div>
                            <span className="rounded-full border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.82)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--ui-text-muted)/0.94)]">
                                {workspaceRoleLabel}
                            </span>
                        </div>
                        <div className="mt-1 ui-meta">
                            This appears on certificates, progress screens, and account UI.
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="group relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-[rgb(var(--ui-border)/1)] bg-[rgb(var(--ui-surface)/1)]"
                        aria-label="Choose profile image"
                        title="Choose profile image"
                    >
                        {previewImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={previewImage}
                                alt="Profile"
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <span className="text-sm font-semibold text-[rgb(var(--ui-text)/0.92)]">
                                {initialsFrom(trimmedName, savedProfile.email)}
                            </span>
                        )}
                        <span className="absolute inset-x-0 bottom-0 grid h-5 place-items-center bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                            <Camera aria-hidden="true" className="h-3 w-3" />
                        </span>
                    </button>
                </div>

                <form
                    className="grid gap-5 p-5"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (canSave) onSave();
                    }}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={PROFILE_AVATAR_ACCEPT}
                        className="sr-only"
                        onChange={(event) => onChooseAvatar(event.target.files?.[0] ?? null)}
                    />

                    <div className="grid gap-3 rounded-xl border border-[rgb(var(--ui-border)/0.85)] bg-[rgb(var(--ui-surface)/0.55)] p-4 sm:grid-cols-[auto_1fr] sm:items-center">
                        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border border-[rgb(var(--ui-border)/1)] bg-[rgb(var(--ui-surface-2)/0.8)]">
                            {previewImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={previewImage}
                                    alt="Profile preview"
                                    className="h-full w-full object-cover"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <span className="text-lg font-semibold text-[rgb(var(--ui-text)/0.92)]">
                                    {initialsFrom(trimmedName, savedProfile.email)}
                                </span>
                            )}
                        </div>
                        <div className="min-w-0">
                            <FieldLabel>Profile image</FieldLabel>
                            <div className="mt-1 ui-meta">
                                Upload a square JPEG, PNG, or WebP image up to 4 MB.
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={saving}
                                    className="ui-btn-secondary inline-flex items-center gap-2"
                                >
                                    <ImagePlus aria-hidden="true" className="h-4 w-4" />
                                    {previewImage ? "Change image" : "Choose image"}
                                </button>
                                {(previewImage || savedProfile.image) && (
                                    <button
                                        type="button"
                                        onClick={onRemoveAvatar}
                                        disabled={saving}
                                        className="ui-btn-secondary inline-flex items-center gap-2"
                                    >
                                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

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
                                {nameError ? nameError : `Used across ${appName}.`}
                            </div>
                            <div className="tabular-nums text-[11px] font-medium text-[rgb(var(--ui-text-soft)/0.82)]">
                                {trimmedName.length}/60
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <FieldLabel>Email</FieldLabel>
                        <div className="ui-surface-soft px-4 py-3 text-sm font-medium text-[rgb(var(--ui-text)/0.88)]">
                            {savedProfile.email || "—"}
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
                                title={nameError ? nameError : !dirty ? "No changes to save" : undefined}
                            >
                                {saving ? "Saving…" : "Save changes"}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {navigationSections.map((section) => (
                <NavigationSection key={section.id} section={section} />
            ))}
        </div>
    );
}
