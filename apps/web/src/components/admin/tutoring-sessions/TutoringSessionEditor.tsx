"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";

type Course = {
  id: string;
  slug: string;
  title: string;
  modules: Array<{
    slug: string;
    title: string;
    sections: Array<{ slug: string; title: string }>;
    topics: Array<{ id: string; title: string }>;
  }>;
};

type Group = { id: string; name: string; memberCount: number };

type InitialSession = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  subjectId: string;
  selectionScope: "course" | "module" | "section" | "topic";
  sourceModuleSlug: string | null;
  sourceSectionSlug: string | null;
  sourceTopicId: string | null;
  status: "draft" | "live" | "shared" | "archived";
  allowStudentEditing: boolean;
  users: Array<{ user: { email: string | null } }>;
  groups: Array<{ groupId: string }>;
} | null;

const field =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function emailsFromText(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function openLabel(status: "draft" | "live" | "shared" | "archived") {
  if (status === "draft") return "Open draft";
  if (status === "shared") return "Open shared session";
  if (status === "archived") return "Preview archived session";
  return "Open live session";
}

export default function TutoringSessionEditor({
  initialSession,
  courses,
  groups,
}: {
  initialSession: InitialSession;
  courses: Course[];
  groups: Group[];
}) {
  const router = useRouter();
  const isNew = !initialSession;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState(() => ({
    subjectId: initialSession?.subjectId ?? courses[0]?.id ?? "",
    selectionScope: initialSession?.selectionScope ?? ("course" as const),
    sourceModuleSlug: initialSession?.sourceModuleSlug ?? "",
    sourceSectionSlug: initialSession?.sourceSectionSlug ?? "",
    sourceTopicId: initialSession?.sourceTopicId ?? "",
    title: initialSession?.title ?? "",
    slug: initialSession?.slug ?? "",
    description: initialSession?.description ?? "",
    userEmails: (initialSession?.users ?? [])
      .map((row) => row.user.email)
      .filter(Boolean)
      .join("\n"),
    groupIds: (initialSession?.groups ?? []).map((row) => row.groupId),
    status: initialSession?.status ?? ("draft" as const),
    allowStudentEditing: initialSession?.allowStudentEditing ?? true,
  }));

  const course = useMemo(
    () => courses.find((item) => item.id === state.subjectId) ?? courses[0] ?? null,
    [courses, state.subjectId],
  );
  const modules = course?.modules ?? [];
  const selectedModuleSlug = state.sourceModuleSlug || modules[0]?.slug || "";
  const module = modules.find((item) => item.slug === selectedModuleSlug) ?? null;
  const sections = module?.sections ?? [];
  const topics = module?.topics ?? [];
  const selectedSectionSlug = state.sourceSectionSlug || sections[0]?.slug || "";
  const selectedTopicId = state.sourceTopicId || topics[0]?.id || "";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const createPayload = {
        title: state.title,
        slug: state.slug || slugify(state.title),
        description: state.description || null,
        subjectId: state.subjectId,
        selectionScope: state.selectionScope,
        sourceModuleSlug:
          state.selectionScope === "course" ? null : selectedModuleSlug || null,
        sourceSectionSlug:
          state.selectionScope === "section" ? selectedSectionSlug || null : null,
        sourceTopicId:
          state.selectionScope === "topic" ? selectedTopicId || null : null,
        status: state.status,
        allowStudentEditing: state.allowStudentEditing,
        userEmails: emailsFromText(state.userEmails),
        groupIds: state.groupIds,
      };
      const updatePayload = {
        title: state.title,
        description: state.description || null,
        status: state.status,
        allowStudentEditing: state.allowStudentEditing,
        userEmails: emailsFromText(state.userEmails),
        groupIds: state.groupIds,
      };
      const endpoint = isNew
        ? "/api/admin/tutoring-sessions"
        : `/api/admin/tutoring-sessions/${initialSession.id}`;
      const response = await fetch(endpoint, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? createPayload : updatePayload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const missing = Array.isArray(json.missingEmails)
          ? ` Missing: ${json.missingEmails.join(", ")}`
          : "";
        throw new Error(`${json.error ?? "Could not save tutoring session."}${missing}`);
      }
      router.replace(`/admin/tutoring-sessions/${json.session.id}`);
      router.refresh();
    } catch (cause: any) {
      setError(cause?.message ?? "Could not save tutoring session.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!initialSession || !confirm("Delete this tutoring session and its saved boards?")) return;
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/tutoring-sessions/${initialSession.id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      router.replace("/admin/tutoring-sessions");
      router.refresh();
      return;
    }
    setBusy(false);
    setError("Could not delete tutoring session.");
  }

  function openSession() {
    if (!initialSession) return;
    router.push(`/tutoring-sessions/${initialSession.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Teaching
          </div>
          <h1 className="mt-1 text-3xl font-semibold">
            {isNew ? "New private tutoring session" : "Edit tutoring session"}
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            {isNew
              ? "Reuse a published course, module, section, or topic without creating a second lesson format."
              : "The selected curriculum snapshot stays frozen. Update delivery, audience, and shared-workspace permissions here."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew ? (
            <button
              type="button"
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium"
              onClick={openSession}
              disabled={busy}
            >
              {openLabel(state.status)}
            </button>
          ) : null}
          {!isNew ? (
            <button
              type="button"
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700"
              onClick={destroy}
              disabled={busy}
            >
              Delete
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={save}
            disabled={busy || !state.subjectId || !state.title.trim()}
          >
            {busy ? "Saving…" : isNew ? "Create session" : "Save"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border bg-white p-6">
          <h2 className="font-semibold">Content snapshot</h2>
          <label className="block text-sm font-medium">
            Course
            <select
              className={field}
              value={state.subjectId}
              disabled={!isNew}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  subjectId: event.target.value,
                  sourceModuleSlug: "",
                  sourceSectionSlug: "",
                  sourceTopicId: "",
                }))
              }
            >
              {courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Content scope
            <select
              className={field}
              value={state.selectionScope}
              disabled={!isNew}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  selectionScope: event.target.value as typeof current.selectionScope,
                  sourceSectionSlug: "",
                  sourceTopicId: "",
                }))
              }
            >
              <option value="course">Whole course</option>
              <option value="module">Module</option>
              <option value="section">Section</option>
              <option value="topic">Topic</option>
            </select>
          </label>
          {state.selectionScope !== "course" ? (
            <label className="block text-sm font-medium">
              Module
              <select
                className={field}
                value={selectedModuleSlug}
                disabled={!isNew}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    sourceModuleSlug: event.target.value,
                    sourceSectionSlug: "",
                    sourceTopicId: "",
                  }))
                }
              >
                {modules.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {state.selectionScope === "section" ? (
            <label className="block text-sm font-medium">
              Section
              <select
                className={field}
                value={selectedSectionSlug}
                disabled={!isNew}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    sourceSectionSlug: event.target.value,
                  }))
                }
              >
                {sections.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {state.selectionScope === "topic" ? (
            <label className="block text-sm font-medium">
              Topic
              <select
                className={field}
                value={selectedTopicId}
                disabled={!isNew}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    sourceTopicId: event.target.value,
                  }))
                }
              >
                {topics.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!isNew ? (
            <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">
              This session keeps the curriculum version captured when it was created. Create a new session to tutor a different course slice.
            </div>
          ) : null}
        </section>

        <section className="space-y-4 rounded-2xl border bg-white p-6">
          <h2 className="font-semibold">Session and delivery</h2>
          <label className="block text-sm font-medium">
            Session title
            <input
              className={field}
              value={state.title}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  title: event.target.value,
                  slug: isNew && !current.slug ? slugify(event.target.value) : current.slug,
                }))
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Slug
            <input
              className={field}
              value={state.slug}
              disabled={!isNew}
              onChange={(event) =>
                setState((current) => ({ ...current, slug: event.target.value }))
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Notes for students
            <textarea
              className={`${field} min-h-28`}
              value={state.description}
              onChange={(event) =>
                setState((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label className="block text-sm font-medium">
            Status
            <select
              className={field}
              value={state.status}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  status: event.target.value as typeof current.status,
                }))
              }
            >
              <option value="draft">Draft — tutor preview only</option>
              <option value="live">Live — invited learners can enter</option>
              <option value="shared">Shared — saved for learner review</option>
              <option value="archived">Archived — hidden from learners</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.allowStudentEditing}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  allowStudentEditing: event.target.checked,
                }))
              }
            />
            Students may edit the shared session workspace
          </label>
        </section>
      </div>

      <section className="grid gap-6 rounded-2xl border bg-white p-6 lg:grid-cols-2">
        <label className="block text-sm font-medium">
          Student emails
          <textarea
            className={`${field} min-h-28`}
            value={state.userEmails}
            onChange={(event) =>
              setState((current) => ({ ...current, userEmails: event.target.value }))
            }
            placeholder="student@example.com"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            One email per line. Students must already have ZoeSkoul accounts.
          </span>
        </label>
        <div>
          <div className="text-sm font-medium">Groups</div>
          <div className="mt-2 space-y-2">
            {groups.length ? (
              groups.map((group) => {
                const checked = state.groupIds.includes(group.id);
                return (
                  <label
                    key={group.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  >
                    <span>
                      {group.name} <span className="text-neutral-500">({group.memberCount})</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          groupIds: event.target.checked
                            ? [...current.groupIds, group.id]
                            : current.groupIds.filter((id) => id !== group.id),
                        }))
                      }
                    />
                  </label>
                );
              })
            ) : (
              <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-500">
                Create a student group first, or invite individual emails.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
