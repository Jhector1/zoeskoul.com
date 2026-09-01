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

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs)
    .toISOString()
    .slice(0, 16);
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
  if (error instanceof TeacherTutoringApiError) {
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "Teacher tutoring is temporarily unavailable.";
}

export default function TeacherTutoringDashboard(props: {
  apiOrigin: string;
  websiteOrigin: string;
  locale: string;
}) {
  const [overview, setOverview] =
    useState<TeacherTutoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] =
    useState<EditableWindow[]>([]);
  const [scheduleValues, setScheduleValues] =
    useState<Record<string, string>>({});

  const browserTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
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
            (request.status === "requested" ||
              request.status === "assigned")
          ) {
            seeded[request.id] =
              toLocalInput(request.preferredStartsAt);
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
      await setTeacherTutoringEnabled(
        props.apiOrigin,
        !overview.pool.enabled,
      );
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
    window.location.assign(
      new URL(path, props.websiteOrigin).toString(),
    );
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

  const now = Date.now();

  return (
    <main className="teacher-shell">
      <div className="teacher-page">
        <header className="teacher-page-header">
          <div>
            <div className="eyebrow">Human tutoring</div>
            <h1>Paid tutoring</h1>
            <p>
              Manage learner requests, availability, scheduled sessions,
              and reserved tutoring minutes. Prepared sessions continue in
              the existing ZoeSkoul tutoring workspace.
            </p>
          </div>

          <button
            type="button"
            className={
              overview?.pool.enabled
                ? "button secondary"
                : "button primary"
            }
            disabled={loading || busy !== null}
            onClick={() => void toggleEnabled()}
          >
            {overview?.pool.enabled
              ? "Pause new requests"
              : "Accept tutoring requests"}
          </button>
        </header>

        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Availability</h2>
              <p>
                Times use this device's local time zone:{" "}
                <strong>{browserTimeZone}</strong>.
              </p>
            </div>
            <button
              type="button"
              className="button secondary"
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

          <div className="availability-list">
            {availability.map((window, index) => (
              <div
                className="availability-row"
                key={`${index}:${window.startsAt}`}
              >
                <label>
                  <span>Starts</span>
                  <input
                    type="datetime-local"
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

                <label>
                  <span>Ends</span>
                  <input
                    type="datetime-local"
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
                  className="button quiet"
                  onClick={() =>
                    setAvailability((current) =>
                      current.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}

            {!availability.length ? (
              <div className="empty-state">
                No future availability windows saved.
              </div>
            ) : null}
          </div>

          <div className="panel-actions">
            <button
              type="button"
              className="button primary"
              disabled={busy !== null}
              onClick={() => void saveAvailability()}
            >
              {busy === "availability"
                ? "Saving..."
                : "Save availability"}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Tutoring requests</h2>
              <p>
                ZoeSkoul assigns the authenticated teacher. Learners request a
                preferred time; you confirm it or adjust to another available time.
              </p>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={busy !== null}
              onClick={() => void refresh()}
            >
              Refresh
            </button>
          </div>

          <div className="request-list">
            {loading ? (
              <div className="empty-state">
                Loading tutoring requests...
              </div>
            ) : overview?.requests.length ? (
              overview.requests.map((request) => {
                const booking = latestBooking(request);
                const preparedSessionId =
                  request.tutoringSessionId ??
                  booking?.tutoringSessionId ??
                  null;
                const scheduled = request.status === "scheduled";
                const scheduling =
                  request.status === "requested" ||
                  request.status === "assigned";

                return (
                  <article className="request-card" key={request.id}>
                    <div className="request-card-top">
                      <div>
                        <h3>{learnerLabel(request)}</h3>
                        <div className="meta">
                          {request.requestedMinutes} min
                          {" • "}
                          {request.sourceSubjectSlug ?? "Course context"}
                          {request.sourceModuleSlug
                            ? ` / ${request.sourceModuleSlug}`
                            : ""}
                        </div>
                      </div>
                      <span className="pill">{request.status}</span>
                    </div>

                    {request.note ? (
                      <p className="request-note">{request.note}</p>
                    ) : null}

                    {request.preferredStartsAt ? (
                      <div className="booking-summary">
                        <strong>Preferred:</strong>{" "}
                        {formatDateTime(request.preferredStartsAt)}
                      </div>
                    ) : null}

                    {booking ? (
                      <div className="booking-summary">
                        <strong>Scheduled:</strong>{" "}
                        {formatDateTime(booking.startsAt)}
                      </div>
                    ) : null}

                    {scheduling ? (
                      <div className="schedule-row">
                        <label>
                          <span>Confirm or adjust start time</span>
                          <input
                            type="datetime-local"
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
                          className="button primary"
                          disabled={
                            busy !== null ||
                            !overview?.pool.enabled
                          }
                          onClick={() => void schedule(request)}
                        >
                          Confirm time
                        </button>
                      </div>
                    ) : null}

                    {scheduled ? (
                      <div className="request-actions">
                        {!preparedSessionId ? (
                          <button
                            type="button"
                            className="button primary"
                            disabled={busy !== null}
                            onClick={() => void prepare(request)}
                          >
                            {busy === `prepare:${request.id}`
                              ? "Preparing..."
                              : "Prepare session"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button primary"
                            onClick={() =>
                              openSessionEditor(preparedSessionId)
                            }
                          >
                            Open tutoring workspace
                          </button>
                        )}

                        {canComplete(request, now) ? (
                          <button
                            type="button"
                            className="button secondary"
                            disabled={busy !== null}
                            onClick={() => void complete(request)}
                          >
                            Complete session
                          </button>
                        ) : null}

                        {booking ? (
                          <button
                            type="button"
                            className="button danger"
                            disabled={busy !== null}
                            onClick={() => void cancel(request)}
                          >
                            Cancel booking
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className="empty-state">
                No open human tutoring requests.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
