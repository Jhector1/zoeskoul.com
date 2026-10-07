import { ApiClientError } from "@zoeskoul/api-client";
import { useEffect, useMemo, useState } from "react";

import { TeacherLink } from "../../app/TeacherLink";
import { useTranslations } from "../../compat/next-intl";
import { TeacherAnnouncementsPanel } from "../announcements/TeacherAnnouncementsPanel";
import { TeacherReportsPage } from "../reports/TeacherReportsPage";
import { TeacherSchoolCoursesPanel } from "./TeacherSchoolCoursesPanel";
import { TeacherStaffClassAssignments } from "./TeacherStaffClassAssignments";
import {
  createTeacherSchoolClient,
  type SchoolAccess,
  type SchoolDetail,
  type SchoolRole,
  type SchoolSummary,
} from "./teacherSchoolClient";

type InstitutionTab =
  | "overview"
  | "classes"
  | "staff"
  | "courses"
  | "announcements"
  | "reports"
  | "settings";

function locale(value: string): "en" | "es" | "fr" | "ht" {
  return value === "es" || value === "fr" || value === "ht" ? value : "en";
}

function message(error: unknown, fallback: string) {
  return error instanceof ApiClientError
    ? ((error.payload as { error?: string } | undefined)?.error ?? fallback)
    : error instanceof Error
      ? error.message
      : fallback;
}

export function TeacherSchoolPage(props: {
  apiOrigin: string;
  locale: string;
}) {
  const t = useTranslations("Teacher.school");
  const client = useMemo(
    () => createTeacherSchoolClient({ apiOrigin: props.apiOrigin }),
    [props.apiOrigin],
  );

  const [schools, setSchools] = useState<SchoolSummary[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [access, setAccess] = useState<SchoolAccess | null>(null);
  const [tab, setTab] = useState<InstitutionTab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SchoolRole>("instructor");
  const [inviteComposerOpen, setInviteComposerOpen] = useState(false);

  async function loadOne(id: string) {
    const result = await client.getSchool(id);
    setSchool(result.school);
    setAccess(result.access);
    setName(result.school.name);
    setDescription(result.school.description ?? "");
  }

  async function loadList(preferredId?: string) {
    const result = await client.listSchools();
    setSchools(result.schools);
    const nextId = preferredId || schoolId || result.schools[0]?.id || "";
    setSchoolId(nextId);
    if (nextId) await loadOne(nextId);
    else {
      setSchool(null);
      setAccess(null);
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const result = await client.listSchools();
        if (!alive) return;
        setSchools(result.schools);
        const first = result.schools[0]?.id ?? "";
        setSchoolId(first);
        if (first) {
          const detail = await client.getSchool(first);
          if (!alive) return;
          setSchool(detail.school);
          setAccess(detail.access);
          setName(detail.school.name);
          setDescription(detail.school.description ?? "");
        }
      } catch (cause) {
        if (alive) setError(message(cause, t("errors.load")));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, t]);

  async function act(
    action: () => Promise<void>,
    fallback: string,
    success?: string,
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
    } catch (cause) {
      setError(message(cause, fallback));
    } finally {
      setBusy(false);
    }
  }

  const pendingInvites =
    school?.invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt) ?? [];
  const staff =
    school?.memberships.filter((membership) => membership.userId !== school.ownerId) ?? [];
  const openClasses = school?.groups.filter((group) => group.status === "open") ?? [];

  const settingsDirty = Boolean(
    school &&
      (
        name.trim() !== school.name.trim() ||
        description.trim() !== (school.description ?? "").trim()
      ),
  );
  const settingsValid = name.trim().length >= 2;

  const tabs: Array<{ key: InstitutionTab; label: string }> = [
    { key: "overview", label: t("workspace.tabs.overview") },
    { key: "classes", label: t("workspace.tabs.classes") },
    { key: "staff", label: t("workspace.tabs.staff") },
    { key: "courses", label: t("workspace.tabs.courses") },
    { key: "announcements", label: t("workspace.tabs.announcements") },
    { key: "reports", label: t("workspace.tabs.reports") },
    { key: "settings", label: t("workspace.tabs.settings") },
  ];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("kicker")}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {school?.name ?? t("title")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">
            {t("subtitle")}
          </p>
        </div>

        {schools.length > 1 ? (
          <label className="grid min-w-[260px] gap-2 text-sm">
            <span className="font-medium">{t("selector.label")}</span>
            <select
              value={schoolId}
              className="ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm"
              onChange={(event) => {
                const next = event.target.value;
                setSchoolId(next);
                setTab("overview");
                void act(
                  async () => {
                    if (next) await loadOne(next);
                    else {
                      setSchool(null);
                      setAccess(null);
                    }
                  },
                  t("errors.load"),
                );
              }}
            >
              <option value="">{t("selector.none")}</option>
              {schools.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="ui-surface-soft mt-5 rounded-xl p-4 text-sm">{notice}</div>
      ) : null}

      {loading ? (
        <div className="ui-surface mt-6 rounded-xl p-5 text-sm text-neutral-500">
          {t("loading")}
        </div>
      ) : null}

      {!loading && !school ? (
        <section className="ui-surface mt-6 rounded-xl p-5">
          <h2 className="text-xl font-semibold">{t("create.title")}</h2>
          <p className="mt-1 text-sm text-neutral-500">{t("create.description")}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span>{t("create.name")}</span>
              <input className="ui-input-ide ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>{t("create.slug")}</span>
              <input className="ui-input-ide ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm"
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            className="ui-btn-primary mt-4 h-9 px-4"
            onClick={() =>
              void act(
                async () => {
                  if (!newName.trim() || !newSlug.trim()) {
                    throw new Error(t("errors.createFields"));
                  }
                  const result = await client.createSchool({
                    name: newName.trim(),
                    slug: newSlug.trim(),
                    description: null,
                  });
                  setNewName("");
                  setNewSlug("");
                  await loadList(result.school.id);
                },
                t("errors.create"),
                t("notices.created"),
              )
            }
          >
            {t("create.action")}
          </button>
        </section>
      ) : null}

      {school ? (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className={access?.canManageSchool ? "ui-badge-good rounded-full px-3 py-1 text-xs" : "ui-pill-neutral rounded-full px-3 py-1 text-xs"}>
              {t(access?.canManageSchool ? "details.manage" : "details.readOnly")}
            </span>
            <span className="text-xs text-neutral-500">{t("details.slug", { slug: school.slug })}</span>
          </div>

          <nav
            aria-label={t("workspace.navLabel")}
            className="mt-5 flex gap-1 overflow-x-auto border-b ui-border-soft"
          >
            {tabs.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-current={tab === item.key ? "page" : undefined}
                onClick={() => setTab(item.key)}
                className={[
                  "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium",
                  tab === item.key
                    ? "border-[rgb(var(--ui-text)/0.58)] text-[rgb(var(--ui-text)/0.96)]"
                    : "border-transparent text-[rgb(var(--ui-text-muted)/0.78)] hover:text-[rgb(var(--ui-text)/0.96)]",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-6">
            {tab === "overview" ? (
              <div className="grid gap-6">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="ui-surface rounded-xl p-4">
                    <div className="text-xs text-neutral-500">{t("overview.openClasses")}</div>
                    <div className="mt-1 text-2xl font-semibold">{openClasses.length}</div>
                  </div>
                  <div className="ui-surface rounded-xl p-4">
                    <div className="text-xs text-neutral-500">{t("overview.allClasses")}</div>
                    <div className="mt-1 text-2xl font-semibold">{school.groups.length}</div>
                  </div>
                  <div className="ui-surface rounded-xl p-4">
                    <div className="text-xs text-neutral-500">{t("overview.staff")}</div>
                    <div className="mt-1 text-2xl font-semibold">{staff.length + 1}</div>
                  </div>
                  <div className="ui-surface rounded-xl p-4">
                    <div className="text-xs text-neutral-500">{t("overview.pendingInvites")}</div>
                    <div className="mt-1 text-2xl font-semibold">{pendingInvites.length}</div>
                  </div>
                </div>

                <section className="ui-surface rounded-xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{t("overview.recentClasses")}</h2>
                      <p className="mt-1 text-sm text-neutral-500">{t("overview.recentClassesBody")}</p>
                    </div>
                    <button type="button" className="ui-btn-secondary h-9 px-4" onClick={() => setTab("classes")}>
                      {t("workspace.tabs.classes")}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {school.groups.slice(0, 4).map((group) => (
                      <TeacherLink
                        key={group.id}
                        href={`/classes/${encodeURIComponent(group.id)}`}
                        locale={props.locale}
                        className="ui-surface-soft block rounded-xl p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{group.name}</div>
                          <span className="ui-pill-neutral text-xs">
                            {t(`classes.status.${group.status}`)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {t("classes.meta", {
                            students: group._count.members,
                            assignments: group._count.assignments,
                          })}
                        </div>
                      </TeacherLink>
                    ))}
                    {!school.groups.length ? (
                      <div className="text-sm text-neutral-500">{t("classes.empty")}</div>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null}

            {tab === "classes" ? (
              <section>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{t("classes.title")}</h2>
                    <p className="mt-1 text-sm text-neutral-500">{t("classes.description")}</p>
                  </div>
                  <TeacherLink href="/classes/new" locale={props.locale} className="ui-btn-primary h-9 px-4">
                    {t("classes.new")}
                  </TeacherLink>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {school.groups.map((group) => (
                    <TeacherLink
                      key={group.id}
                      href={`/classes/${encodeURIComponent(group.id)}`}
                      locale={props.locale}
                      className="ui-surface block rounded-xl p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{group.name}</div>
                        <span className="ui-pill-neutral text-xs">
                          {t(`classes.status.${group.status}`)}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-neutral-500">
                        {t("classes.meta", {
                          students: group._count.members,
                          assignments: group._count.assignments,
                        })}
                      </div>
                    </TeacherLink>
                  ))}
                  {!school.groups.length ? (
                    <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">{t("classes.empty")}</div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {tab === "staff" ? (
              <div className="grid gap-6">
                <section className="ui-surface rounded-xl p-5">
                  <h2 className="text-lg font-semibold">{t("staff.title")}</h2>
                  <p className="mt-1 text-sm text-neutral-500">{t("staff.description")}</p>
                  <div className="ui-surface-soft mt-4 rounded-lg p-4">
                    <div className="font-medium">{school.owner.name || school.owner.email || t("staff.ownerFallback")}</div>
                    <div className="mt-1 text-sm text-neutral-500">{school.owner.email || t("na")}</div>
                    <div className="mt-2 text-xs font-medium uppercase text-neutral-500">{t("staff.owner")}</div>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {staff.map((membership) => (
                      <div key={membership.userId} className="ui-surface-soft rounded-lg p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{membership.user.name || membership.user.email || t("staff.memberFallback")}</div>
                            <div className="mt-1 text-sm text-neutral-500">{membership.user.email || t("na")}</div>
                          </div>
                          {access?.canManageStaff ? (
                            <div className="flex gap-2">
                              <select
                                disabled={busy}
                                value={membership.role}
                                className="ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm"
                                onChange={(event) =>
                                  void act(
                                    async () => {
                                      await client.updateStaff(school.id, {
                                        action: "role",
                                        userId: membership.userId,
                                        role: event.target.value as SchoolRole,
                                      });
                                      await loadOne(school.id);
                                    },
                                    t("errors.staff"),
                                    t("notices.role"),
                                  )
                                }
                              >
                                <option value="instructor">{t("roles.instructor")}</option>
                                <option value="admin">{t("roles.admin")}</option>
                              </select>
                              <button
                                type="button"
                                disabled={busy}
                                className="ui-btn-secondary h-9 px-3"
                                onClick={() =>
                                  void act(
                                    async () => {
                                      await client.updateStaff(school.id, {
                                        action: "remove",
                                        userId: membership.userId,
                                      });
                                      await loadOne(school.id);
                                    },
                                    t("errors.staff"),
                                    t("notices.removed"),
                                  )
                                }
                              >
                                {t("staff.remove")}
                              </button>
                            </div>
                          ) : (
                            <span className="ui-pill-neutral text-xs">{t(`roles.${membership.role}`)}</span>
                          )}
                        </div>
                        {membership.role === "instructor" && access?.canManageStaff ? (
                          <TeacherStaffClassAssignments
                            apiOrigin={props.apiOrigin}
                            schoolId={school.id}
                            staffUserId={membership.userId}
                            classes={school.groups}
                            onChanged={() => loadOne(school.id)}
                          />
                        ) : null}
                      </div>
                    ))}
                    {!staff.length ? <p className="text-sm text-neutral-500">{t("staff.empty")}</p> : null}
                  </div>
                </section>

                {access?.canManageStaff ? (
                  <section className="ui-surface rounded-xl p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold">{t("invites.title")}</h2>
                        <p className="mt-1 text-sm text-neutral-500">{t("invites.description")}</p>
                      </div>
                      <button
                        type="button"
                        className="ui-btn-secondary h-9 px-3"
                        onClick={() => setInviteComposerOpen((open) => !open)}
                      >
                        {t(inviteComposerOpen ? "invites.cancelComposer" : "invites.openComposer")}
                      </button>
                    </div>
                    {inviteComposerOpen ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto_auto]">
                      <input className="ui-input-ide ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder={t("invites.email")}
                      />
                      <select
                        value={role}
                        onChange={(event) => setRole(event.target.value as SchoolRole)}
                        className="ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm"
                      >
                        <option value="instructor">{t("roles.instructor")}</option>
                        <option value="admin">{t("roles.admin")}</option>
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        className="ui-btn-primary h-10 px-4"
                        onClick={() =>
                          void act(
                            async () => {
                              if (!email.trim()) throw new Error(t("errors.inviteEmail"));
                              await client.deliverInvite(school.id, {
                                action: "email",
                                email: email.trim(),
                                role,
                                locale: locale(props.locale),
                              });
                              setEmail("");
                              await loadOne(school.id);
                            },
                            t("errors.invite"),
                            t("notices.sent"),
                          )
                        }
                      >
                        {t("invites.send")}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="ui-btn-secondary h-10 px-4"
                        onClick={() =>
                          void act(
                            async () => {
                              if (!email.trim()) throw new Error(t("errors.inviteEmail"));
                              const result = await client.deliverInvite(school.id, {
                                action: "link",
                                email: email.trim(),
                                role,
                                locale: locale(props.locale),
                              });
                              if (result?.inviteUrl) await navigator.clipboard.writeText(result.inviteUrl);
                              await loadOne(school.id);
                            },
                            t("errors.copy"),
                            t("notices.copied"),
                          )
                        }
                      >
                        {t("invites.copy")}
                      </button>
                    </div>

                    ) : null}

                    <div className="mt-4 grid gap-3">
                      {pendingInvites.map((invite) => (
                        <div key={invite.id} className="ui-surface-soft rounded-lg p-4">
                          <div className="flex flex-wrap justify-between gap-3">
                            <div>
                              <div className="font-medium">{invite.email}</div>
                              <div className="mt-1 text-sm text-neutral-500">
                                {t("invites.pending", { role: t(`roles.${invite.role}`) })}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="ui-btn-secondary h-9 px-3"
                                onClick={() =>
                                  void act(
                                    async () => {
                                      const result = await client.deliverInvite(school.id, {
                                        action: "link",
                                        email: invite.email,
                                        role: invite.role,
                                        locale: locale(props.locale),
                                      });
                                      if (result?.inviteUrl) await navigator.clipboard.writeText(result.inviteUrl);
                                      await loadOne(school.id);
                                    },
                                    t("errors.copy"),
                                    t("notices.copied"),
                                  )
                                }
                              >
                                {t("invites.copy")}
                              </button>
                              <button
                                type="button"
                                className="ui-btn-secondary h-9 px-3"
                                onClick={() =>
                                  void act(
                                    async () => {
                                      await client.deliverInvite(school.id, {
                                        action: "email",
                                        email: invite.email,
                                        role: invite.role,
                                        locale: locale(props.locale),
                                      });
                                      await loadOne(school.id);
                                    },
                                    t("errors.invite"),
                                    t("notices.sent"),
                                  )
                                }
                              >
                                {t("invites.resend")}
                              </button>
                              <button
                                type="button"
                                className="ui-btn-secondary h-9 px-3"
                                onClick={() =>
                                  void act(
                                    async () => {
                                      await client.deliverInvite(school.id, {
                                        action: "revoke",
                                        email: invite.email,
                                      });
                                      await loadOne(school.id);
                                    },
                                    t("errors.revoke"),
                                    t("notices.revoked"),
                                  )
                                }
                              >
                                {t("invites.revoke")}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {!pendingInvites.length ? <p className="text-sm text-neutral-500">{t("invites.empty")}</p> : null}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}

            {tab === "courses" ? (
              <TeacherSchoolCoursesPanel
                apiOrigin={props.apiOrigin}
                locale={props.locale}
                schoolId={school.id}
                canManage={Boolean(access?.canManageSchool)}
              />
            ) : null}

            {tab === "announcements" ? (
              <TeacherAnnouncementsPanel
                apiOrigin={props.apiOrigin}
                locale={props.locale}
                scope="school"
                targetId={school.id}
                canPublish={Boolean(access?.canManageSchool)}
                  collapseComposerByDefault
              />
            ) : null}

            {tab === "reports" ? (
              <TeacherReportsPage
                apiOrigin={props.apiOrigin}
                locale={props.locale}
                fixedSchoolId={school.id}
                embedded
              />
            ) : null}

            {tab === "settings" ? (
              <section className="ui-surface rounded-xl p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{t("details.title")}</h2>
                    <p className="mt-1 text-sm text-neutral-500">{t("settings.description")}</p>
                  </div>
                  <span className={access?.canManageSchool ? "ui-badge-good rounded-full px-3 py-1 text-xs" : "ui-pill-neutral rounded-full px-3 py-1 text-xs"}>
                    {t(access?.canManageSchool ? "details.manage" : "details.readOnly")}
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-2 text-sm">
                    <span>{t("details.name")}</span>
                    <input className="ui-input-ide ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
                      disabled={!access?.canManageSchool}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>{t("details.description")}</span>
                    <textarea
                      disabled={!access?.canManageSchool}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className="ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm leading-6 min-h-24 disabled:opacity-60"
                    />
                  </label>
                  <div className="text-xs text-neutral-500">{t("details.slug", { slug: school.slug })}</div>
                </div>
                {access?.canManageSchool ? (
                  <button
                    type="button"
                    disabled={busy || !settingsDirty || !settingsValid}
                    className="ui-btn-primary mt-4 h-9 px-4"
                    onClick={() =>
                      void act(
                        async () => {
                          await client.updateSchool(school.id, {
                            name: name.trim(),
                            description: description.trim() || null,
                          });
                          await loadOne(school.id);
                        },
                        t("errors.save"),
                        t("notices.saved"),
                      )
                    }
                  >
                    {t("details.save")}
                  </button>
                ) : null}
              </section>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}
