import { useEffect, useMemo, useState } from "react";

import {
  TeacherTutoringApiError,
  cancelTeacherTutoringBooking,
  completeTeacherTutoringBooking,
  loadTeacherTutoringOverview,
  prepareTeacherTutoringRequest,
  replaceTeacherAvailability,
  scheduleTeacherTutoringRequest,
  setTeacherTutoringEnabled,
  type TeacherTutoringOverview,
  type TeacherTutoringRequest,
} from "./teacherTutoringClient";

type EditableWindow = {
  startsAt: string;
  endsAt: string;
};

type TutoringTab =
  | "needs-scheduling"
  | "upcoming"
  | "needs-action"
  | "availability"
  | "history";

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIso(value: string) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) {
    throw new Error("Choose a valid date and time.");
  }
  return date.toISOString();
}

function formatDateTime(value: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function learnerLabel(request: TeacherTutoringRequest) {
  return request.learner.name || request.learner.email || "Learner";
}

function latestBooking(request: TeacherTutoringRequest) {
  return request.bookings[0] ?? null;
}

function scheduledTimingBucket(
  request: TeacherTutoringRequest,
  now: number,
): "upcoming" | "needs-action" | null {
  const booking = latestBooking(request);
  if (
    request.status !== "scheduled" ||
    !booking ||
    booking.status !== "scheduled"
  ) {
    return null;
  }

  const startsAt = new Date(booking.startsAt).getTime();
  if (!Number.isFinite(startsAt)) return null;

  return startsAt < now ? "needs-action" : "upcoming";
}

function canComplete(request: TeacherTutoringRequest, now: number) {
  const booking = latestBooking(request);
  if (
    request.status !== "scheduled" ||
    !booking ||
    !request.tutoringSessionId
  ) {
    return false;
  }

  const end =
    new Date(booking.startsAt).getTime() +
    booking.durationMinutes * 60_000;

  return Number.isFinite(end) && end <= now;
}

function errorMessage(error: unknown) {
  if (error instanceof TeacherTutoringApiError) return error.message;
  return error instanceof Error
    ? error.message
    : "Teacher tutoring is temporarily unavailable.";
}

function RequestMeta(props: { request: TeacherTutoringRequest }) {
  const request = props.request;
  return (
    <div className="mt-1 text-xs text-neutral-500">
      {request.requestedMinutes} min
      {" · "}
      {request.sourceSubjectSlug ?? "Course context"}
      {request.sourceModuleSlug ? ` / ${request.sourceModuleSlug}` : ""}
    </div>
  );
}

export default function TeacherTutoringDashboard(props: {
  apiOrigin: string;
  websiteOrigin: string;
  locale: string;
}) {
  const [overview, setOverview] = useState<TeacherTutoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TutoringTab>("needs-scheduling");
  const [now, setNow] = useState(() => Date.now());
  const [availability, setAvailability] = useState<EditableWindow[]>([]);
  const [scheduleValues, setScheduleValues] = useState<Record<string, string>>({});

  const browserTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    setError(null);
    try {
      const next = await loadTeacherTutoringOverview(props.apiOrigin);
      setOverview(next);
      setAvailability(
        next.availability.availabilityWindows.map((window) => ({
          startsAt: toLocalInput(window.startsAt),
          endsAt: toLocalInput(window.endsAt),
        })),
      );
      setScheduleValues((current) => {
        const seeded = { ...current };
        for (const request of next.requests) {
          if (
            !seeded[request.id] &&
            request.preferredStartsAt &&
            (request.status === "requested" || request.status === "assigned")
          ) {
            seeded[request.id] = toLocalInput(request.preferredStartsAt);
          }
        }
        return seeded;
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [props.apiOrigin]);

  async function toggleEnabled() {
    if (!overview) return;
    setBusy("pool");
    setError(null);
    try {
      await setTeacherTutoringEnabled(props.apiOrigin, !overview.pool.enabled);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function saveAvailability() {
    setBusy("availability");
    setError(null);
    try {
      await replaceTeacherAvailability({
        apiOrigin: props.apiOrigin,
        timeZone: browserTimeZone,
        windows: availability.map((window) => ({
          startsAt: toIso(window.startsAt),
          endsAt: toIso(window.endsAt),
        })),
      });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function schedule(request: TeacherTutoringRequest) {
    const value = scheduleValues[request.id];
    if (!value) {
      setError("Choose a tutoring start time.");
      return;
    }

    setBusy(`schedule:${request.id}`);
    setError(null);
    try {
      await scheduleTeacherTutoringRequest({
        apiOrigin: props.apiOrigin,
        requestId: request.id,
        startsAt: toIso(value),
      });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  function openSessionEditor(sessionId: string) {
    const path =
      `/${encodeURIComponent(props.locale)}` +
      `/admin/tutoring-sessions/${encodeURIComponent(sessionId)}`;
    window.location.assign(new URL(path, props.websiteOrigin).toString());
  }

  async function prepare(request: TeacherTutoringRequest) {
    setBusy(`prepare:${request.id}`);
    setError(null);
    try {
      const result = await prepareTeacherTutoringRequest({
        apiOrigin: props.apiOrigin,
        requestId: request.id,
      });
      await refresh();
      openSessionEditor(result.session.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function complete(request: TeacherTutoringRequest) {
    const booking = latestBooking(request);
    if (!booking) return;

    setBusy(`complete:${request.id}`);
    setError(null);
    try {
      await completeTeacherTutoringBooking({
        apiOrigin: props.apiOrigin,
        bookingId: booking.id,
      });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(request: TeacherTutoringRequest) {
    const booking = latestBooking(request);
    if (!booking) return;
    if (
      !window.confirm(
        "Cancel this tutoring booking and return the reserved minutes to the learner?",
      )
    ) {
      return;
    }

    setBusy(`cancel:${request.id}`);
    setError(null);
    try {
      await cancelTeacherTutoringBooking({
        apiOrigin: props.apiOrigin,
        bookingId: booking.id,
      });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  const needsScheduling = (overview?.requests ?? []).filter(
    (request) => request.status === "requested" || request.status === "assigned",
  );
  const scheduled = (overview?.requests ?? []).filter(
    (request) => request.status === "scheduled",
  );
  const upcoming = scheduled.filter(
    (request) => scheduledTimingBucket(request, now) === "upcoming",
  );
  const needsAction = scheduled.filter(
    (request) => scheduledTimingBucket(request, now) === "needs-action",
  );
  const history = overview?.history ?? [];

  const tabs: Array<{ key: TutoringTab; label: string; count?: number }> = [
    { key: "needs-scheduling", label: "Needs scheduling", count: needsScheduling.length },
    { key: "upcoming", label: "Upcoming", count: upcoming.length },
    { key: "needs-action", label: "Needs action", count: needsAction.length },
    { key: "availability", label: "Availability" },
    { key: "history", label: "History", count: history.length },
  ];

  function requestCard(
    request: TeacherTutoringRequest,
    mode: "scheduling" | "upcoming" | "needs-action",
  ) {
    const booking = latestBooking(request);
    const preparedSessionId =
      request.tutoringSessionId ?? booking?.tutoringSessionId ?? null;

    return (
      <article className="ui-surface rounded-xl p-5" key={request.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{learnerLabel(request)}</h3>
            <RequestMeta request={request} />
          </div>
          <span className="ui-pill-neutral text-xs capitalize">{request.status}</span>
        </div>

        {request.note ? (
          <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-white/70">
            {request.note}
          </p>
        ) : null}

        {request.preferredStartsAt ? (
          <div className="mt-3 text-sm text-neutral-600 dark:text-white/70">
            <strong>Preferred:</strong> {formatDateTime(request.preferredStartsAt)}
          </div>
        ) : null}

        {booking ? (
          <div className="mt-1 text-sm text-neutral-600 dark:text-white/70">
            <strong>Scheduled:</strong> {formatDateTime(booking.startsAt)}
          </div>
        ) : null}

        {mode === "scheduling" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Confirm or adjust start time</span>
              <input
                type="datetime-local"
                className="ui-input-ide ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm"
                value={scheduleValues[request.id] ?? ""}
                onChange={(event) =>
                  setScheduleValues((current) => ({
                    ...current,
                    [request.id]: event.target.value,
                  }))
                }
              />
            </label>
            <button
              type="button"
              className="ui-btn-primary h-10 px-4"
              disabled={busy !== null || !overview?.pool.enabled}
              onClick={() => void schedule(request)}
            >
              Confirm time
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {!preparedSessionId ? (
              <button
                type="button"
                className="ui-btn-primary h-9 px-4"
                disabled={busy !== null}
                onClick={() => void prepare(request)}
              >
                {busy === `prepare:${request.id}` ? "Preparing…" : "Prepare session"}
              </button>
            ) : (
              <button
                type="button"
                className="ui-btn-primary h-9 px-4"
                onClick={() => openSessionEditor(preparedSessionId)}
              >
                Open tutoring workspace
              </button>
            )}

            {canComplete(request, now) ? (
              <button
                type="button"
                className="ui-btn-secondary h-9 px-4"
                disabled={busy !== null}
                onClick={() => void complete(request)}
              >
                Complete session
              </button>
            ) : null}

            {booking ? (
              <button
                type="button"
                className="h-9 rounded-lg border border-red-300 px-4 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-500/40 dark:text-red-300"
                disabled={busy !== null}
                onClick={() => void cancel(request)}
              >
                Cancel booking
              </button>
            ) : null}
          </div>
        )}
      </article>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Human tutoring
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Tutoring</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Schedule learner requests, prepare upcoming sessions, manage availability,
            and review completed or canceled tutoring from one workspace.
          </p>
        </div>

        <div className="ui-surface flex items-center gap-3 rounded-xl px-4 py-3">
          <div>
            <div className="text-xs text-neutral-500">New requests</div>
            <div className="text-sm font-medium">
              {overview?.pool.enabled ? "Accepting" : "Paused"}
            </div>
          </div>
          <button
            type="button"
            className={overview?.pool.enabled ? "ui-btn-secondary h-9 px-4" : "ui-btn-primary h-9 px-4"}
            disabled={loading || busy !== null}
            onClick={() => void toggleEnabled()}
          >
            {overview?.pool.enabled ? "Pause" : "Start accepting"}
          </button>
        </div>
      </header>

      {error ? (
        <div
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <nav
        aria-label="Tutoring workspace"
        className="mt-7 flex gap-1 overflow-x-auto border-b ui-border-soft"
      >
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-current={tab === item.key ? "page" : undefined}
            className={[
              "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium",
              tab === item.key
                ? "border-[rgb(var(--ui-text)/0.58)] text-[rgb(var(--ui-text)/0.96)]"
                : "border-transparent text-[rgb(var(--ui-text-muted)/0.78)] hover:text-[rgb(var(--ui-text)/0.96)]",
            ].join(" ")}
            onClick={() => setTab(item.key)}
          >
            {item.label}{item.count !== undefined ? ` · ${item.count}` : ""}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "needs-scheduling" ? (
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Needs scheduling</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Confirm the learner's preferred time or adjust it before booking.
                </p>
              </div>
              <button
                type="button"
                className="ui-btn-secondary h-9 px-4"
                disabled={busy !== null}
                onClick={() => void refresh()}
              >
                Refresh
              </button>
            </div>
            <div className="grid gap-3">
              {loading ? (
                <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">
                  Loading tutoring requests…
                </div>
              ) : needsScheduling.length ? (
                needsScheduling.map((request) => requestCard(request, "scheduling"))
              ) : (
                <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">
                  No tutoring requests need scheduling.
                </div>
              )}
            </div>
          </section>
        ) : null}

        {tab === "upcoming" ? (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Upcoming sessions</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Prepare the workspace, run the session, then complete or cancel the booking.
              </p>
            </div>
            <div className="grid gap-3">
              {loading ? (
                <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">
                  Loading scheduled tutoring…
                </div>
              ) : upcoming.length ? (
                upcoming.map((request) => requestCard(request, "upcoming"))
              ) : (
                <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">
                  No tutoring sessions are currently scheduled.
                </div>
              )}
            </div>
          </section>
        ) : null}

        {tab === "needs-action" ? (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Needs action</h2>
              <p className="mt-1 text-sm text-neutral-500">
                These scheduled sessions have reached their start time. Prepare or open
                the workspace, then complete or cancel the booking explicitly.
              </p>
            </div>
            <div className="grid gap-3">
              {loading ? (
                <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">
                  Loading tutoring that needs action…
                </div>
              ) : needsAction.length ? (
                needsAction.map((request) => requestCard(request, "needs-action"))
              ) : (
                <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">
                  No scheduled tutoring needs action.
                </div>
              )}
            </div>
          </section>
        ) : null}

        {tab === "availability" ? (
          <section className="ui-surface rounded-xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Availability</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Times use this device's local time zone: <strong>{browserTimeZone}</strong>.
                </p>
              </div>
              <button
                type="button"
                className="ui-btn-secondary h-9 px-4"
                disabled={busy !== null}
                onClick={() =>
                  setAvailability((current) => [
                    ...current,
                    { startsAt: "", endsAt: "" },
                  ])
                }
              >
                Add window
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {availability.map((window, index) => (
                <div
                  className="ui-surface-soft grid gap-3 rounded-lg p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
                  key={`${index}:${window.startsAt}`}
                >
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium">Starts</span>
                    <input
                      type="datetime-local"
                      className="ui-input-ide ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm"
                      value={window.startsAt}
                      onChange={(event) =>
                        setAvailability((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, startsAt: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="font-medium">Ends</span>
                    <input
                      type="datetime-local"
                      className="ui-input-ide ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm"
                      value={window.endsAt}
                      onChange={(event) =>
                        setAvailability((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, endsAt: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="ui-btn-secondary h-9 px-4"
                    onClick={() =>
                      setAvailability((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}

              {!availability.length ? (
                <div className="ui-surface-soft rounded-xl p-5 text-sm text-neutral-500">
                  No future availability windows saved.
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="ui-btn-primary h-9 px-4"
                disabled={busy !== null}
                onClick={() => void saveAvailability()}
              >
                {busy === "availability" ? "Saving…" : "Save availability"}
              </button>
            </div>
          </section>
        ) : null}

        {tab === "history" ? (
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-semibold">History</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Completed and canceled tutoring assigned to this teacher.
              </p>
            </div>
            <div className="grid gap-3">
              {loading ? (
                <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">
                  Loading tutoring history…
                </div>
              ) : history.length ? (
                history.map((request) => {
                  const booking = latestBooking(request);
                  const terminalAt =
                    request.completedAt ?? request.canceledAt ?? request.updatedAt;
                  return (
                    <article className="ui-surface rounded-xl p-5" key={request.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{learnerLabel(request)}</h3>
                          <RequestMeta request={request} />
                        </div>
                        <span className="ui-pill-neutral text-xs capitalize">
                          {request.status}
                        </span>
                      </div>
                      <div className="mt-3 text-sm text-neutral-500">
                        {booking ? `Scheduled ${formatDateTime(booking.startsAt)} · ` : ""}
                        {request.status === "completed" ? "Completed" : "Canceled"}{" "}
                        {formatDateTime(terminalAt)}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">
                  No completed or canceled tutoring yet.
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
