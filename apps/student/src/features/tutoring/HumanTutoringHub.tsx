import type {
  LearningTutoringSummary,
} from "@zoeskoul/learning-client";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import TutoringSessionCard from "@/components/tutoring/TutoringSessionCard";
import HumanTutoringManageCreditsModal from "./HumanTutoringManageCreditsModal";
import HumanTutoringRequestModal from "./HumanTutoringRequestModal";
import {
  OTHER_TUTORING_SUBJECT_VALUE,
} from "./tutoringSubjectCatalog";
import {
  HumanTutoringApiError,
  authorizeTutoringSavedPaymentMethod,
  cancelHumanTutoringRequest,
  createHumanTutoringRequest,
  loadHumanTutoringOverview,
  loadTutoringSavedPaymentMethod,
  startTutoringCreditCheckout,
  startTutoringSavedCardPayment,
  type LearnerTutoringRequest,
  type TutoringOverview,
  type TutoringSavedPaymentMethod,
  loadTutoringRefundableCredits,
  requestTutoringCreditRefund,
} from "./humanTutoringClient";

export type HumanTutoringCourse = {
  slug: string;
  title: string;
};

function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string,
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountMinor / 100);
}

function formatRequestTime(
  value: string | null,
  locale: string,
) {
  if (!value) return "No preferred time";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function validMinuteChoice(
  minutes: number,
  policy:
    | TutoringOverview["credits"]["pricing"]
    | undefined,
) {
  if (!policy) return false;
  return (
    Number.isSafeInteger(minutes) &&
    minutes >= policy.minimumMinutes &&
    minutes <= policy.maximumMinutes
  );
}

function requestStatusLabel(
  request: LearnerTutoringRequest,
  locale: string,
) {
  if (request.status === "scheduled" && request.scheduledAt) {
    const when = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(request.scheduledAt));
    return `Scheduled • ${when}`;
  }

  switch (request.status) {
    case "requested":
      return "Waiting for a tutor";
    case "assigned":
      return "Tutor assigned";
    case "completed":
      return "Completed";
    case "canceled":
      return "Canceled";
    default:
      return request.status;
  }
}

function requestTone(status: string) {
  if (status === "scheduled") {
    return "ui-pill-success";
  }
  if (status === "completed") {
    return "ui-pill-neutral";
  }
  if (status === "canceled") {
    return "ui-pill-neutral";
  }
  return "ui-pill-info";
}

function errorMessage(error: unknown) {
  if (
    error instanceof HumanTutoringApiError &&
    error.code === "INSUFFICIENT_TUTORING_CREDITS"
  ) {
    return `You need ${error.requiredMinutes ?? "more"} available tutoring minutes. Add minutes first.`;
  }

  return error instanceof Error
    ? error.message
    : "Human tutoring is temporarily unavailable.";
}

export default function HumanTutoringHub(props: {
  apiOrigin: string;
  locale: string;
  courses: HumanTutoringCourse[];
  tutoringSessions: LearningTutoringSummary[];
}) {
  const [overview, setOverview] =
    useState<TutoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courseSlug, setCourseSlug] = useState(
    () => props.courses[0]?.slug ?? "",
  );
  const [customSubject, setCustomSubject] =
    useState("");
  const [requestedMinutes, setRequestedMinutes] =
    useState(30);
  const [purchaseMinutes, setPurchaseMinutes] =
    useState(120);
  const [preferredStartsAt, setPreferredStartsAt] =
    useState("");
  const [note, setNote] = useState("");
  const [requestModalOpen, setRequestModalOpen] =
    useState(false);
  const [manageCreditsOpen, setManageCreditsOpen] =
    useState(false);
  const [refundable, setRefundable] =
    useState<Awaited<
      ReturnType<
        typeof loadTutoringRefundableCredits
      >
    > | null>(null);
  const [refundLoading, setRefundLoading] =
    useState(false);
  const [
    refundBusyPurchaseId,
    setRefundBusyPurchaseId,
  ] = useState<string | null>(null);

  const courseTitleBySlug = useMemo(
    () =>
      new Map(
        props.courses.map((course) => [
          course.slug,
          course.title,
        ]),
      ),
    [props.courses],
  );

  async function refresh() {
    setError(null);
    try {
      setOverview(
        await loadHumanTutoringOverview(props.apiOrigin),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void loadHumanTutoringOverview(props.apiOrigin)
      .then((next) => {
        if (active) setOverview(next);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [props.apiOrigin]);

  const [
    savedPaymentMethod,
    setSavedPaymentMethod,
  ] = useState<
    TutoringSavedPaymentMethod | null
  >(null);
  const [
    savedPaymentMethodLoading,
    setSavedPaymentMethodLoading,
  ] = useState(false);

  async function refreshSavedPaymentMethod() {
    setSavedPaymentMethodLoading(
      true,
    );

    try {
      const paymentMethod =
        await loadTutoringSavedPaymentMethod(
          props.apiOrigin,
        );

      setSavedPaymentMethod(
        paymentMethod,
      );

      return paymentMethod;
    } catch {
      setSavedPaymentMethod(
        null,
      );
      return null;
    } finally {
      setSavedPaymentMethodLoading(
        false,
      );
    }
  }

  async function authorizeSavedPaymentMethod() {
    const paymentMethod =
      await authorizeTutoringSavedPaymentMethod(
        props.apiOrigin,
      );

    setSavedPaymentMethod(
      paymentMethod,
    );

    return paymentMethod;
  }

  function openRequestModal() {
    setRequestModalOpen(
      true,
    );
    void refreshSavedPaymentMethod();
  }

  async function startSavedCardPayment(
    minutes: number,
    checkoutAttemptId: string,
  ) {
    const result =
      await startTutoringSavedCardPayment({
        apiOrigin:
          props.apiOrigin,
        checkoutAttemptId,
        minutes,
      });

    if (
      result.kind ===
      "already_paid"
    ) {
      await refresh();
    }

    return result;
  }

  async function startEmbeddedCreditCheckout(
    minutes: number,
  ) {
    const result =
      await startTutoringCreditCheckout({
        apiOrigin:
          props.apiOrigin,
        checkoutAttemptId:
          crypto.randomUUID(),
        minutes,
        locale:
          props.locale,
        uiMode:
          "embedded",
      });

    if (
      result.kind ===
      "embedded_checkout"
    ) {
      return result;
    }

    if (
      result.kind ===
      "already_paid"
    ) {
      await refresh();
      return null;
    }

    throw new Error(
      "Unable to start embedded tutoring payment. Please try again.",
    );
  }

  async function refreshEmbeddedCreditBalance() {
    const next =
      await loadHumanTutoringOverview(
        props.apiOrigin,
      );

    setOverview(next);

    return (
      next.credits.balance
        .availableMinutes
    );
  }

  async function buyMinutes(minutes: number) {
    if (!validMinuteChoice(minutes, overview?.credits.pricing)) {
      setError(
        "Choose a whole-minute tutoring amount starting at 30 minutes.",
      );
      return;
    }

    setBusy(`checkout:${minutes}`);
    setError(null);

    try {
      const result = await startTutoringCreditCheckout({
        apiOrigin: props.apiOrigin,
        checkoutAttemptId: crypto.randomUUID(),
        minutes,
        locale: props.locale,
      });

      if (result.kind === "checkout") {
        window.location.assign(result.url);
        return;
      }

      if (result.kind === "already_paid") {
        await refresh();
        return;
      }

      setError(
        "That checkout expired. Start a new checkout to add minutes.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function refreshRefundableCredits() {
    setRefundLoading(
      true,
    );

    try {
      const next =
        await loadTutoringRefundableCredits(
          props.apiOrigin,
        );

      setRefundable(
        next,
      );

      return next;
    } finally {
      setRefundLoading(
        false,
      );
    }
  }

  function openManageCredits() {
    setManageCreditsOpen(
      true,
    );

    void refreshRefundableCredits()
      .catch(
        (cause) => {
          setError(
            errorMessage(
              cause,
            ),
          );
        },
      );
  }

  async function requestCreditRefund(
    purchaseId: string,
    minutes: number,
  ) {
    setRefundBusyPurchaseId(
      purchaseId,
    );
    setError(null);

    try {
      await requestTutoringCreditRefund({
        apiOrigin:
          props.apiOrigin,
        refundAttemptId:
          crypto.randomUUID(),
        purchaseId,
        minutes,
      });

      for (
        let attempt = 0;
        attempt < 16;
        attempt += 1
      ) {
        const next =
          await refreshRefundableCredits();

        await refresh();

        const purchase =
          next.purchases.find(
            (item) =>
              item.purchaseId ===
              purchaseId,
          );

        if (
          !purchase ||
          purchase
            .pendingRefundMinutes ===
            0
        ) {
          break;
        }

        await new Promise(
          (resolve) =>
            window.setTimeout(
              resolve,
              750,
            ),
        );
      }
    } catch (cause) {
      setError(
        errorMessage(
          cause,
        ),
      );

      await refreshRefundableCredits()
        .catch(
          () => null,
        );

      await refresh();
    } finally {
      setRefundBusyPurchaseId(
        null,
      );
    }
  }

  async function cancelRequest(
    requestId: string,
  ) {
    const target = overview?.requests.find(
      (request) => request.id === requestId,
    );

    if (!target) return;

    const label =
      target.status === "scheduled"
        ? "Cancel this tutoring session? Reserved minutes will return to your available balance."
        : "Cancel this tutoring request?";

    if (!window.confirm(label)) return;

    setBusy(`cancel:${requestId}`);
    setError(null);

    try {
      await cancelHumanTutoringRequest({
        apiOrigin: props.apiOrigin,
        requestId,
      });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function submitRequest() {
    const selectedSubject =
      courseSlug ===
      OTHER_TUTORING_SUBJECT_VALUE
        ? customSubject.trim()
        : courseSlug.trim();

    if (!selectedSubject) {
      setError(
        "Select a subject or enter another technology topic.",
      );
      return;
    }

    if (!validMinuteChoice(requestedMinutes, overview?.credits.pricing)) {
      setError(
        "Choose a valid whole-minute tutoring duration.",
      );
      return;
    }

    const preferredDate = new Date(preferredStartsAt);
    if (
      !preferredStartsAt ||
      !Number.isFinite(preferredDate.getTime()) ||
      preferredDate.getTime() <= Date.now()
    ) {
      setError(
        "Choose a preferred tutoring date and time in the future.",
      );
      return;
    }

    setBusy("request");
    setError(null);

    try {
      await createHumanTutoringRequest({
        apiOrigin: props.apiOrigin,
        requestAttemptId: crypto.randomUUID(),
        requestedMinutes,
        preferredStartsAt: new Date(
          preferredStartsAt,
        ).toISOString(),
        sourceSubjectSlug:
          selectedSubject,
        note: note.trim() || null,
      });
      setNote("");
      setPreferredStartsAt("");
      await refresh();
      setRequestModalOpen(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  const balance = overview?.credits.balance;
  const packages =
    overview?.credits.purchasePackages ?? [];
  const pricing = overview?.credits.pricing;
  const durations =
    overview?.credits.sessionDurations ?? [30, 60];
  const purchaseValid =
    validMinuteChoice(purchaseMinutes, pricing);
  const requestedValid =
    validMinuteChoice(requestedMinutes, pricing);
  const customPurchaseAmount =
    pricing && purchaseValid
      ? purchaseMinutes * pricing.rateMinorPerMinute
      : null;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[#0b0d12] dark:text-white">
      <main className="ui-container py-8">
        <div className="space-y-6">
          <section className="ui-page-surface overflow-hidden">
            <div className="border-b border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface-2)/0.72)] px-5 py-5 sm:px-6">
              <div className="ui-section-kicker">
                Human tutoring
              </div>
              <h1 className="mt-1 ui-title-md">
                Get help from a real tutor
              </h1>
              <p className="mt-2 max-w-3xl ui-meta">
                Use the AI Tutor whenever you need it. When you need a person,
                choose how much time you need and your preferred date and time.
                ZoeSkoul assigns the tutor for you.
              </p>
            </div>

            {error ? (
              <div
                role="alert"
                className="m-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm"
              >
                {error}
              </div>
            ) : null}

            <div
              className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
              aria-busy={loading}
            >
              <div>
                <div className="text-2xl font-semibold sm:text-3xl">
                  {loading
                    ? "—"
                    : `${balance?.totalMinutes ?? 0} tutoring minutes`}
                </div>
                <div className="mt-1 ui-meta">
                  {loading
                    ? "Loading wallet…"
                    : `${balance?.availableMinutes ?? 0} available · ${balance?.reservedMinutes ?? 0} reserved`}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="ui-btn-primary min-h-11 px-5"
                  disabled={loading || busy !== null}
                  onClick={openRequestModal}
                >
                  Request tutoring
                </button>
                <button
                  type="button"
                  className="ui-btn-secondary min-h-11 px-5"
                  disabled={loading || busy !== null}
                  onClick={openManageCredits}
                >
                  Manage credits
                </button>
              </div>
            </div>
          </section>

          <HumanTutoringManageCreditsModal
            open={manageCreditsOpen}
            locale={props.locale}
            loading={loading}
            busy={busy !== null}
            credits={overview?.credits ?? null}
            refundable={refundable}
            refundLoading={refundLoading}
            refundBusyPurchaseId={refundBusyPurchaseId}
            purchaseMinutes={purchaseMinutes}
            onPurchaseMinutesChange={setPurchaseMinutes}
            onBuyMinutes={(minutes) => {
              void buyMinutes(minutes);
            }}
            onRequestRefund={requestCreditRefund}
            onClose={() => setManageCreditsOpen(false)}
          />


              <HumanTutoringRequestModal
                open={requestModalOpen}
                locale={props.locale}
                courses={props.courses}
                courseSlug={courseSlug}
                customSubject={customSubject}
                requestedMinutes={requestedMinutes}
                preferredStartsAt={preferredStartsAt}
                note={note}
                availableMinutes={balance?.availableMinutes ?? 0}
                pricing={pricing}
                busy={busy === "request"}
                error={error}
                onCourseSlugChange={setCourseSlug}
                onCustomSubjectChange={setCustomSubject}
                onRequestedMinutesChange={setRequestedMinutes}
                onPreferredStartsAtChange={setPreferredStartsAt}
                onNoteChange={setNote}
                savedPaymentMethod={
                  savedPaymentMethod
                }
                savedPaymentMethodLoading={
                  savedPaymentMethodLoading
                }
                onAuthorizeSavedPaymentMethod={
                  authorizeSavedPaymentMethod
                }
                onStartSavedCardPayment={
                  startSavedCardPayment
                }
                onStartEmbeddedCheckout={
                  startEmbeddedCreditCheckout
                }
                onRefreshCredits={
                  refreshEmbeddedCreditBalance
                }
                onClose={() => setRequestModalOpen(false)}
                onSubmit={submitRequest}
              />
          <section className="ui-page-surface p-5 sm:p-6">
            <div className="ui-section-kicker">
              Your requests
            </div>
            <h2 className="mt-1 text-xl font-semibold">
              Tutoring request status
            </h2>

            <div className="mt-4 grid gap-3">
              {loading ? (
                <div className="ui-meta">
                  Loading tutoring requests…
                </div>
              ) : overview?.requests.length ? (
                overview.requests.map((request) => (
                  <article
                    key={request.id}
                    className="rounded-xl border border-[rgb(var(--ui-border)/0.9)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">
                          {courseTitleBySlug.get(
                            request.sourceSubjectSlug ?? "",
                          ) ??
                            request.sourceSubjectSlug ??
                            "Tutoring"}
                        </div>
                        <div className="mt-1 ui-meta">
                          {request.requestedMinutes} minute session
                        </div>
                        {request.preferredStartsAt ? (
                          <div className="mt-1 ui-meta">
                            Preferred:{" "}
                            {formatRequestTime(
                              request.preferredStartsAt,
                              props.locale,
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span
                          className={requestTone(
                            request.status,
                          )}
                        >
                          {requestStatusLabel(
                            request,
                            props.locale,
                          )}
                        </span>

                        {request.status === "requested" ||
                        request.status === "assigned" ||
                        (request.status === "scheduled" &&
                          request.scheduledAt &&
                          new Date(
                            request.scheduledAt,
                          ).getTime() > Date.now()) ? (
                          <button
                            type="button"
                            className="ui-btn-secondary min-h-9 px-3 text-xs"
                            disabled={busy !== null}
                            onClick={() => {
                              void cancelRequest(request.id);
                            }}
                          >
                            {busy === `cancel:${request.id}`
                              ? "Canceling…"
                              : request.status === "scheduled"
                                ? "Cancel session"
                                : "Cancel request"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {request.note ? (
                      <p className="mt-3 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                        {request.note}
                      </p>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="ui-meta">
                  You have not requested human tutoring yet.
                </div>
              )}
            </div>
          </section>

          <section id="tutoring" className="scroll-mt-24">
            <div className="mb-4">
              <div className="ui-section-kicker">
                Shared tutoring workspaces
              </div>
              <h2 className="mt-1 ui-title-md">
                Tutoring sessions
              </h2>
              <p className="mt-1 ui-meta">
                Join active sessions and reopen lessons, boards, and
                explanations shared by your tutor.
              </p>
            </div>

            {props.tutoringSessions.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {props.tutoringSessions.map((session) => (
                  <TutoringSessionCard
                    key={session.id}
                    session={session}
                  />
                ))}
              </div>
            ) : (
              <div className="ui-page-surface p-6 text-sm text-[rgb(var(--ui-text-muted)/0.9)]">
                No tutoring workspace has been shared with you yet.
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
