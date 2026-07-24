"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import PendingAccountInvites from "@/components/admin/invitations/PendingAccountInvites";

type Course = { id: string; slug: string; title: string; visibility: string };
type Group = { id: string; name: string; slug: string; memberCount: number };
type PendingInvite = {
  id: string;
  email: string;
  expiresAt: string | Date;
  sentAt: string | Date | null;
  acceptedAt: string | Date | null;
  revokedAt: string | Date | null;
};

type InitialAssignment = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  subjectId: string;
  status: "draft" | "assigned" | "closed";
  availableFrom: string | Date | null;
  dueAt: string | Date | null;
  solutionVisibility:
    | "instructor_only"
    | "after_completion"
    | "after_due_date"
    | "always";
  users: Array<{ user: { email: string | null } }>;
  groups: Array<{ groupId: string }>;
  invites: PendingInvite[];
} | null;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function localDateTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
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

function initialRecipientText(assignment: Exclude<InitialAssignment, null>) {
  return [
    ...new Set(
      [
        ...assignment.users.map((row) => row.user.email),
        ...assignment.invites
          .filter((invite) => !invite.acceptedAt && !invite.revokedAt)
          .map((invite) => invite.email),
      ]
        .filter((email): email is string => Boolean(email))
        .map((email) => email.toLowerCase()),
    ),
  ].join("\n");
}

function pendingInvites(assignment: InitialAssignment) {
  return (assignment?.invites ?? []).filter(
    (invite) => !invite.acceptedAt && !invite.revokedAt,
  );
}

const field =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200";

export default function CourseAssignmentEditor({
  initialAssignment,
  courses,
  groups,
}: {
  initialAssignment: InitialAssignment;
  courses: Course[];
  groups: Group[];
}) {
  const router = useRouter();
  const isNew = !initialAssignment;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, setState] = useState(() => ({
    title: initialAssignment?.title ?? "",
    slug: initialAssignment?.slug ?? "",
    description: initialAssignment?.description ?? "",
    subjectId: initialAssignment?.subjectId ?? courses[0]?.id ?? "",
    status: initialAssignment?.status ?? ("draft" as const),
    availableFrom: localDateTime(initialAssignment?.availableFrom),
    dueAt: localDateTime(initialAssignment?.dueAt),
    solutionVisibility:
      initialAssignment?.solutionVisibility ?? ("instructor_only" as const),
    userEmails: initialAssignment ? initialRecipientText(initialAssignment) : "",
    groupIds: (initialAssignment?.groups ?? []).map((row) => row.groupId),
  }));

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === state.subjectId) ?? null,
    [courses, state.subjectId],
  );
  const invites = pendingInvites(initialAssignment);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        ...state,
        slug: state.slug || slugify(state.title),
        description: state.description || null,
        availableFrom: state.availableFrom
          ? new Date(state.availableFrom).toISOString()
          : null,
        dueAt: state.dueAt ? new Date(state.dueAt).toISOString() : null,
        userEmails: emailsFromText(state.userEmails),
      };
      const endpoint = isNew
        ? "/api/admin/course-assignments"
        : `/api/admin/course-assignments/${initialAssignment.id}`;
      const response = await fetch(endpoint, {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error ?? "Could not save course assignment.");
      }

      const pendingCount = Array.isArray(json.pendingInvites)
        ? json.pendingInvites.length
        : 0;
      setNotice(
        pendingCount
          ? `Saved. ${pendingCount} student${pendingCount === 1 ? " is" : "s are"} waiting for an account invitation.`
          : "Course assignment saved.",
      );
      router.replace(`/admin/course-assignments/${json.assignment.id}`);
      router.refresh();
    } catch (cause: any) {
      setError(cause?.message ?? "Could not save course assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!initialAssignment || !confirm("Delete this course assignment?")) return;
    setBusy(true);
    const response = await fetch(
      `/api/admin/course-assignments/${initialAssignment.id}`,
      { method: "DELETE" },
    );
    if (response.ok) {
      router.replace("/admin/course-assignments");
      router.refresh();
      return;
    }
    setBusy(false);
    setError("Could not delete course assignment.");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isNew ? "Assign a private course" : "Edit course assignment"}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            The assignment grants access to this course. Students do not need a
            personal subscription for assigned content.
          </p>
        </div>
        <div className="flex gap-2">
          {!isNew ? (
            <button
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700"
              onClick={destroy}
              disabled={busy}
            >
              Delete
            </button>
          ) : null}
          <button
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={save}
            disabled={busy || !state.subjectId}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="font-semibold">Content</h2>
          <label className="block text-xs font-medium text-neutral-600">
            Course
            <select
              className={field}
              value={state.subjectId}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  subjectId: event.target.value,
                }))
              }
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} ({course.slug})
                </option>
              ))}
            </select>
          </label>
          {selectedCourse ? (
            <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              Visibility: <strong>{selectedCourse.visibility}</strong>. The
              assignment itself is the learner&apos;s access entitlement.
            </div>
          ) : null}
          <label className="block text-xs font-medium text-neutral-600">
            Assignment title
            <input
              className={field}
              value={state.title}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  title: event.target.value,
                  slug: current.slug || slugify(event.target.value),
                }))
              }
            />
          </label>
          <label className="block text-xs font-medium text-neutral-600">
            Slug
            <input
              className={field}
              value={state.slug}
              onChange={(event) =>
                setState((current) => ({ ...current, slug: event.target.value }))
              }
            />
          </label>
          <label className="block text-xs font-medium text-neutral-600">
            Student instructions
            <textarea
              className={field}
              rows={5}
              value={state.description}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
        </section>

        <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="font-semibold">Delivery</h2>
          <label className="block text-xs font-medium text-neutral-600">
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
              <option value="draft">Draft</option>
              <option value="assigned">Assigned</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-neutral-600">
              Opens
              <input
                type="datetime-local"
                className={field}
                value={state.availableFrom}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    availableFrom: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Due
              <input
                type="datetime-local"
                className={field}
                value={state.dueAt}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    dueAt: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-neutral-600">
            Official solution visibility
            <select
              className={field}
              value={state.solutionVisibility}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  solutionVisibility: event.target
                    .value as typeof current.solutionVisibility,
                }))
              }
            >
              <option value="instructor_only">Instructor only</option>
              <option value="after_completion">After course completion</option>
              <option value="after_due_date">After due date</option>
              <option value="always">Always</option>
            </select>
          </label>
        </section>

        <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold">Audience</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            <label className="block text-xs font-medium text-neutral-600">
              Individual student emails
              <textarea
                className={field}
                rows={7}
                placeholder="student@example.com\none@example.com"
                value={state.userEmails}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    userEmails: event.target.value,
                  }))
                }
              />
              <span className="mt-1 block text-[11px] text-neutral-500">
                Existing accounts are assigned immediately. Emails without an
                account become pending invitations that you can copy or send.
              </span>
            </label>
            <div>
              <div className="text-xs font-medium text-neutral-600">Groups</div>
              <div className="mt-2 grid gap-2">
                {groups.length ? (
                  groups.map((group) => {
                    const checked = state.groupIds.includes(group.id);
                    return (
                      <label
                        key={group.id}
                        className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                      >
                        <span>
                          {group.name}{" "}
                          <span className="text-xs text-neutral-500">
                            ({group.memberCount})
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setState((current) => ({
                              ...current,
                              groupIds: event.target.checked
                                ? [...current.groupIds, group.id]
                                : current.groupIds.filter(
                                    (id) => id !== group.id,
                                  ),
                            }))
                          }
                        />
                      </label>
                    );
                  })
                ) : (
                  <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-500">
                    Create a student group first, or assign individual emails.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {!isNew && initialAssignment ? (
          <PendingAccountInvites
            invites={invites}
            endpoint={`/api/admin/course-assignments/${initialAssignment.id}/invites`}
            enabled={initialAssignment.status === "assigned"}
            disabledMessage="Change the status to Assigned and save before sending invitation links."
            description="These students do not have matching ZoeSkoul accounts yet. The invitation takes them through account creation and then directly into this assigned classroom."
            onNotice={setNotice}
            onError={(message) => setError(message || null)}
          />
        ) : null}
      </div>
    </div>
  );
}
