
"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GraduationCap,
  MessageSquareText,
  TimerReset,
  X,
} from "lucide-react";

import HumanTutoringEmbeddedCheckout from "./HumanTutoringEmbeddedCheckout";
import type {
  TutoringEmbeddedCheckoutResult,
  TutoringPricingPresentation,
  TutoringSavedCardPaymentResult,
  TutoringSavedPaymentMethod,
} from "./humanTutoringClient";

type Course = {
  slug: string;
  title: string;
};

type Props = {
  open: boolean;
  locale: string;
  courses: Course[];
  courseSlug: string;
  requestedMinutes: number;
  preferredStartsAt: string;
  note: string;
  availableMinutes: number;
  pricing: TutoringPricingPresentation | undefined;
  busy: boolean;
  error: string | null;
  onCourseSlugChange: (value: string) => void;
  onRequestedMinutesChange: (value: number) => void;
  onPreferredStartsAtChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  savedPaymentMethod:
    TutoringSavedPaymentMethod | null;
  savedPaymentMethodLoading: boolean;
  onAuthorizeSavedPaymentMethod: () => Promise<TutoringSavedPaymentMethod>;
  onStartSavedCardPayment: (
    shortfallMinutes: number,
    checkoutAttemptId: string,
  ) => Promise<TutoringSavedCardPaymentResult>;
  onStartEmbeddedCheckout: (
    shortfallMinutes: number,
  ) => Promise<
    TutoringEmbeddedCheckoutResult | null
  >;
  onRefreshCredits: () => Promise<number>;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
};

const STEPS = [
  "course",
  "duration",
  "date",
  "time",
  "details",
  "review",
] as const;

const DURATION_PRESETS = [
  30,
  60,
  90,
  120,
] as const;

const TIME_PRESETS = [
  "09:00",
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
] as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
}

function parseDateKey(value: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function selectedParts(value: string) {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);

  return {
    date: match?.[1] ?? "",
    time: match?.[2] ?? "",
  };
}

function monthStart(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1,
  );
}

function addMonths(
  date: Date,
  amount: number,
) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + amount,
    1,
  );
}

function formatMonth(
  date: Date,
  locale: string,
) {
  return new Intl.DateTimeFormat(
    locale,
    {
      month: "long",
      year: "numeric",
    },
  ).format(date);
}

function formatDate(
  dateKey: string,
  locale: string,
) {
  const date = parseDateKey(dateKey);
  if (!date) return "Choose a date";

  return new Intl.DateTimeFormat(
    locale,
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  ).format(date);
}

function formatTime(
  time: string,
  locale: string,
) {
  if (!time) return "Choose a time";
  const [hours, minutes] =
    time.split(":").map(Number);
  const date = new Date(
    2026,
    0,
    1,
    hours,
    minutes,
  );

  return new Intl.DateTimeFormat(
    locale,
    {
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

function durationLabel(
  minutes: number,
) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!remainder) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${hours}h ${remainder}m`;
}

function isValidMinutes(
  minutes: number,
  pricing: TutoringPricingPresentation | undefined,
) {
  if (!pricing) return false;

  return (
    Number.isSafeInteger(minutes) &&
    minutes >= pricing.minimumMinutes &&
    minutes <= pricing.maximumMinutes
  );
}

function isPastDate(
  dateKey: string,
) {
  const date = parseDateKey(dateKey);
  if (!date) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date.getTime() < today.getTime();
}

function isFuturePreferred(
  dateKey: string,
  time: string,
) {
  if (!dateKey || !time) return false;

  const date = new Date(
    `${dateKey}T${time}`,
  );

  return (
    Number.isFinite(date.getTime()) &&
    date.getTime() > Date.now()
  );
}

function CalendarGrid(props: {
  locale: string;
  month: Date;
  selectedDate: string;
  onMonthChange: (value: Date) => void;
  onSelectDate: (value: string) => void;
}) {
  const firstDay = new Date(
    props.month.getFullYear(),
    props.month.getMonth(),
    1,
  );
  const daysInMonth = new Date(
    props.month.getFullYear(),
    props.month.getMonth() + 1,
    0,
  ).getDate();

  const cells: Array<number | null> = [
    ...Array.from(
      { length: firstDay.getDay() },
      () => null,
    ),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => index + 1,
    ),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weekdayFormatter =
    new Intl.DateTimeFormat(
      props.locale,
      {
        weekday: "narrow",
      },
    );

  const weekdays = Array.from(
    { length: 7 },
    (_, index) =>
      weekdayFormatter.format(
        new Date(2026, 7, 23 + index),
      ),
  );

  const currentMonth =
    monthStart(new Date());
  const previousDisabled =
    props.month.getTime() <=
    currentMonth.getTime();

  return (
    <div className="mx-auto w-full max-w-[460px] rounded-2xl border border-[rgb(var(--ui-border)/0.9)] bg-[rgb(var(--ui-surface)/0.9)] p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Previous month"
          className="ui-btn-secondary h-8 w-8 !p-0"
          disabled={previousDisabled}
          onClick={() =>
            props.onMonthChange(
              addMonths(
                props.month,
                -1,
              ),
            )
          }
        >
          <ChevronLeft
            aria-hidden="true"
            className="h-4 w-4"
          />
        </button>

        <div className="text-center text-sm font-semibold sm:text-base">
          {formatMonth(
            props.month,
            props.locale,
          )}
        </div>

        <button
          type="button"
          aria-label="Next month"
          className="ui-btn-secondary h-8 w-8 !p-0"
          onClick={() =>
            props.onMonthChange(
              addMonths(
                props.month,
                1,
              ),
            )
          }
        >
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4"
          />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center">
        {weekdays.map(
          (weekday, index) => (
            <div
              key={`${weekday}-${index}`}
              className="py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-white/45"
            >
              {weekday}
            </div>
          ),
        )}

        {cells.map(
          (day, index) => {
            if (!day) {
              return (
                <div
                  key={`empty-${index}`}
                  aria-hidden="true"
                  className="h-11 w-11 justify-self-center sm:h-12 sm:w-12"
                />
              );
            }

            const date = new Date(
              props.month.getFullYear(),
              props.month.getMonth(),
              day,
            );
            const dateKey =
              localDateKey(date);
            const disabled =
              isPastDate(dateKey);
            const selected =
              dateKey ===
              props.selectedDate;
            const today =
              dateKey ===
              localDateKey(
                new Date(),
              );

            return (
              <button
                key={dateKey}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() =>
                  props.onSelectDate(
                    dateKey,
                  )
                }
                className={[
                  "relative h-11 w-11 justify-self-center rounded-xl text-sm font-medium transition sm:h-12 sm:w-12",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
                  disabled
                    ? "cursor-not-allowed text-neutral-300 dark:text-white/20"
                    : "hover:bg-neutral-100 dark:hover:bg-white/[0.07]",
                  selected
                    ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-600 dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-500"
                    : "",
                  today && !selected
                    ? "ring-1 ring-emerald-500/50"
                    : "",
                ].join(" ")}
              >
                {day}
              </button>
            );
          },
        )}
      </div>
    </div>
  );
}

function StepIcon(props: {
  step: (typeof STEPS)[number];
}) {
  const className = "h-5 w-5";

  switch (props.step) {
    case "course":
      return (
        <GraduationCap
          aria-hidden="true"
          className={className}
        />
      );
    case "duration":
      return (
        <TimerReset
          aria-hidden="true"
          className={className}
        />
      );
    case "date":
      return (
        <CalendarDays
          aria-hidden="true"
          className={className}
        />
      );
    case "time":
      return (
        <Clock3
          aria-hidden="true"
          className={className}
        />
      );
    case "details":
      return (
        <MessageSquareText
          aria-hidden="true"
          className={className}
        />
      );
    case "review":
      return (
        <Check
          aria-hidden="true"
          className={className}
        />
      );
  }
}

export default function HumanTutoringRequestModal(
  props: Props,
) {
  const initialParts =
    selectedParts(
      props.preferredStartsAt,
    );

  const closeRef =
    useRef(props.onClose);
  const busyRef =
    useRef(props.busy);
  const preferredStartsAtRef =
    useRef(
      props.preferredStartsAt,
    );

  closeRef.current =
    props.onClose;
  busyRef.current =
    props.busy;
  preferredStartsAtRef.current =
    props.preferredStartsAt;

  const [stepIndex, setStepIndex] =
    useState(0);
  const [
    direction,
    setDirection,
  ] = useState<
    "forward" | "backward"
  >("forward");
  const [
    selectedDate,
    setSelectedDate,
  ] = useState(
    initialParts.date,
  );
  const [
    selectedTime,
    setSelectedTime,
  ] = useState(
    initialParts.time,
  );
  const [
    calendarMonth,
    setCalendarMonth,
  ] = useState(
    monthStart(
      parseDateKey(
        initialParts.date,
      ) ?? new Date(),
    ),
  );

  const step = STEPS[stepIndex];
  const isLastStep =
    stepIndex ===
    STEPS.length - 1;
  const selectedCourse =
    props.courses.find(
      (course) =>
        course.slug ===
        props.courseSlug,
    ) ?? null;

  const requestHasCredit =
    props.availableMinutes >=
    props.requestedMinutes;

  const durationValid =
    isValidMinutes(
      props.requestedMinutes,
      props.pricing,
    );

  const preferredFuture =
    isFuturePreferred(
      selectedDate,
      selectedTime,
    );

  const canContinue =
    step === "course"
      ? Boolean(props.courseSlug)
      : step === "duration"
        ? durationValid
        : step === "date"
          ? Boolean(
              selectedDate &&
                !isPastDate(
                  selectedDate,
                ),
            )
          : step === "time"
            ? preferredFuture
            : true;

  const canSubmit =
    Boolean(
      props.courseSlug &&
        durationValid &&
        preferredFuture &&
        requestHasCredit,
    );

  const reviewRows = useMemo(
    () => [
      {
        label: "Course",
        value:
          selectedCourse?.title ??
          "Not selected",
      },
      {
        label: "Duration",
        value: durationLabel(
          props.requestedMinutes,
        ),
      },
      {
        label: "Preferred",
        value:
          selectedDate &&
          selectedTime
            ? `${formatDate(
                selectedDate,
                props.locale,
              )} · ${formatTime(
                selectedTime,
                props.locale,
              )}`
            : "Not selected",
      },
      {
        label: "Tutoring credit",
        value: `${props.requestedMinutes} minutes`,
      },
    ],
    [
      props.locale,
      props.requestedMinutes,
      selectedCourse?.title,
      selectedDate,
      selectedTime,
    ],
  );

  useEffect(
    () => {
      if (!props.open) return;

      // Initialize only when the modal opens. Parent field updates
      // must never reset the learner's current wizard step.
      const parts =
        selectedParts(
          preferredStartsAtRef.current,
        );

      setSelectedDate(
        parts.date,
      );
      setSelectedTime(
        parts.time,
      );
      setCalendarMonth(
        monthStart(
          parseDateKey(
            parts.date,
          ) ?? new Date(),
        ),
      );
      setStepIndex(0);
      setDirection(
        "forward",
      );

      const previousOverflow =
        document.body.style.overflow;
      document.body.style.overflow =
        "hidden";

      const onKeyDown = (
        event: KeyboardEvent,
      ) => {
        if (
          event.key === "Escape" &&
          !busyRef.current
        ) {
          closeRef.current();
        }
      };

      window.addEventListener(
        "keydown",
        onKeyDown,
      );

      return () => {
        document.body.style.overflow =
          previousOverflow;
        window.removeEventListener(
          "keydown",
          onKeyDown,
        );
      };
    },
    [props.open],
  );

  if (
    !props.open ||
    typeof document ===
      "undefined"
  ) {
    return null;
  }

  function commitPreferred(
    date: string,
    time: string,
  ) {
    if (
      date &&
      time
    ) {
      props.onPreferredStartsAtChange(
        `${date}T${time}`,
      );
    }
  }

  function selectDate(
    value: string,
  ) {
    setSelectedDate(value);
    commitPreferred(
      value,
      selectedTime,
    );
  }

  function selectTime(
    value: string,
  ) {
    setSelectedTime(value);
    commitPreferred(
      selectedDate,
      value,
    );
  }

  function goNext() {
    if (
      !canContinue ||
      isLastStep
    ) {
      return;
    }

    setDirection("forward");
    setStepIndex(
      (value) =>
        Math.min(
          value + 1,
          STEPS.length - 1,
        ),
    );
  }

  function goBack() {
    if (
      stepIndex <= 0 ||
      props.busy
    ) {
      return;
    }

    setDirection("backward");
    setStepIndex(
      (value) =>
        Math.max(
          value - 1,
          0,
        ),
    );
  }

  const panel = (
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !props.busy
        ) {
          props.onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="human-tutoring-request-title"
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-[#0f1218] sm:h-auto sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-[28px] sm:border sm:border-neutral-200 dark:sm:border-white/10"
      >
        <div className="border-b border-neutral-200 px-5 pb-4 pt-5 dark:border-white/10 sm:px-7 sm:pt-6">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="ui-section-kicker">
                Human tutoring
              </div>
              <h2
                id="human-tutoring-request-title"
                className="mt-1 text-xl font-semibold tracking-tight text-neutral-950 dark:text-white sm:text-2xl"
              >
                Request a tutor
              </h2>
            </div>

            <button
              type="button"
              aria-label="Close"
              className="ui-btn-secondary h-9 w-9 shrink-0 !p-0"
              disabled={props.busy}
              onClick={
                props.onClose
              }
            >
              <X
                aria-hidden="true"
                className="h-4 w-4"
              />
            </button>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-white/45">
              <span>
                Step{" "}
                {stepIndex + 1} of{" "}
                {STEPS.length}
              </span>
              <span>
                {Math.round(
                  ((stepIndex + 1) /
                    STEPS.length) *
                    100,
                )}
                %
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 dark:bg-emerald-400"
                style={{
                  width: `${
                    ((stepIndex + 1) /
                      STEPS.length) *
                    100
                  }%`,
                }}
              />
            </div>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();

            if (
              !isLastStep &&
              canContinue &&
              !props.busy
            ) {
              goNext();
            }
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-7">
            <div
              key={step}
              data-direction={
                direction
              }
              className="mx-auto max-w-xl"
            >
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                <StepIcon
                  step={step}
                />
              </div>

              {step ===
              "course" ? (
                <>
                  <h3 className="text-xl font-semibold tracking-tight">
                    What do you need help with?
                  </h3>
                  <p className="mt-2 ui-meta">
                    Choose the course so your tutor can prepare for the right material.
                  </p>

                  <div className="mt-6 grid gap-2 sm:grid-cols-2">
                    {props.courses.map(
                      (course) => {
                        const selected =
                          props.courseSlug ===
                          course.slug;

                        return (
                          <button
                            key={
                              course.slug
                            }
                            type="button"
                            aria-pressed={
                              selected
                            }
                            onClick={() =>
                              props.onCourseSlugChange(
                                course.slug,
                              )
                            }
                            className={[
                              "flex min-h-14 items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
                              selected
                                ? "border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-100"
                                : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.025] dark:hover:bg-white/[0.05]",
                            ].join(
                              " ",
                            )}
                          >
                            <span>
                              {
                                course.title
                              }
                            </span>
                            {selected ? (
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white dark:bg-emerald-400 dark:text-neutral-950">
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            ) : null}
                          </button>
                        );
                      },
                    )}
                  </div>
                </>
              ) : null}

              {step ===
              "duration" ? (
                <>
                  <h3 className="text-xl font-semibold tracking-tight">
                    How much time do you need?
                  </h3>
                  <p className="mt-2 ui-meta">
                    Pick a quick option or enter any valid custom duration.
                  </p>

                  <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {DURATION_PRESETS.map(
                      (minutes) => {
                        const selected =
                          props.requestedMinutes ===
                          minutes;

                        return (
                          <button
                            key={minutes}
                            type="button"
                            aria-pressed={
                              selected
                            }
                            onClick={() =>
                              props.onRequestedMinutesChange(
                                minutes,
                              )
                            }
                            className={[
                              "min-h-16 rounded-2xl border px-3 text-sm font-semibold transition",
                              selected
                                ? "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-400/10 dark:text-emerald-100"
                                : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.025] dark:hover:bg-white/[0.05]",
                            ].join(
                              " ",
                            )}
                          >
                            {durationLabel(
                              minutes,
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <label className="mt-5 block">
                    <span className="text-sm font-semibold">
                      Custom duration
                    </span>
                    <div className="mt-2 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.025]">
                      <input
                        className="ui-input min-h-11 flex-1"
                        type="number"
                        min={
                          props.pricing
                            ?.minimumMinutes ??
                          30
                        }
                        max={
                          props.pricing
                            ?.maximumMinutes ??
                          720
                        }
                        step={
                          props.pricing
                            ?.incrementMinutes ??
                          1
                        }
                        value={
                          props.requestedMinutes
                        }
                        onChange={(
                          event,
                        ) =>
                          props.onRequestedMinutesChange(
                            Number(
                              event
                                .target
                                .value,
                            ),
                          )
                        }
                      />
                      <span className="pr-1 text-sm font-medium text-neutral-500 dark:text-white/45">
                        minutes
                      </span>
                    </div>
                  </label>

                  <div className="mt-4 rounded-2xl bg-neutral-50 px-4 py-3 text-sm dark:bg-white/[0.04]">
                    <div className="font-medium">
                      {durationLabel(
                        props.requestedMinutes,
                      )}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500 dark:text-white/45">
                      Minimum{" "}
                      Whole minutes · Minimum{" "}
                      {props.pricing
                        ?.minimumMinutes ??
                        30}{" "}
                      min
                    </div>
                  </div>
                </>
              ) : null}

              {step ===
              "date" ? (
                <>
                  <h3 className="text-xl font-semibold tracking-tight">
                    Which day works best?
                  </h3>
                  <p className="mt-2 ui-meta">
                    Choose your preferred day. Your tutor will confirm the final schedule.
                  </p>

                  <div className="mt-5">
                    <CalendarGrid
                      locale={
                        props.locale
                      }
                      month={
                        calendarMonth
                      }
                      selectedDate={
                        selectedDate
                      }
                      onMonthChange={
                        setCalendarMonth
                      }
                      onSelectDate={
                        selectDate
                      }
                    />
                  </div>
                </>
              ) : null}

              {step ===
              "time" ? (
                <>
                  <h3 className="text-xl font-semibold tracking-tight">
                    What time do you prefer?
                  </h3>
                  <p className="mt-2 ui-meta">
                    {formatDate(
                      selectedDate,
                      props.locale,
                    )}
                  </p>

                  <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {TIME_PRESETS.map(
                      (time) => {
                        const selected =
                          selectedTime ===
                          time;
                        const future =
                          isFuturePreferred(
                            selectedDate,
                            time,
                          );

                        return (
                          <button
                            key={time}
                            type="button"
                            disabled={
                              !future
                            }
                            aria-pressed={
                              selected
                            }
                            onClick={() =>
                              selectTime(
                                time,
                              )
                            }
                            className={[
                              "min-h-12 rounded-2xl border px-3 text-sm font-semibold transition",
                              !future
                                ? "cursor-not-allowed border-neutral-100 text-neutral-300 dark:border-white/[0.05] dark:text-white/20"
                                : selected
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-400/10 dark:text-emerald-100"
                                  : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.025] dark:hover:bg-white/[0.05]",
                            ].join(
                              " ",
                            )}
                          >
                            {formatTime(
                              time,
                              props.locale,
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <label className="mt-5 block">
                    <span className="text-sm font-semibold">
                      Other time
                    </span>
                    <input
                      className="ui-input mt-2 min-h-12 w-full"
                      type="time"
                      step={900}
                      value={
                        selectedTime
                      }
                      onChange={(
                        event,
                      ) =>
                        selectTime(
                          event.target
                            .value,
                        )
                      }
                    />
                  </label>

                  <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-300/10 dark:text-amber-100">
                    This is your preferred time, not a confirmed booking. Your assigned tutor can confirm it or suggest another available time.
                  </div>
                </>
              ) : null}

              {step ===
              "details" ? (
                <>
                  <h3 className="text-xl font-semibold tracking-tight">
                    Anything your tutor should know?
                  </h3>
                  <p className="mt-2 ui-meta">
                    Add the topic, assignment, error, or goal you want to work through. This step is optional.
                  </p>

                  <label className="mt-6 block">
                    <span className="sr-only">
                      Tutoring details
                    </span>
                    <textarea
                      className="ui-input min-h-40 w-full resize-y py-3"
                      value={
                        props.note
                      }
                      maxLength={2000}
                      placeholder="Example: I understand Python loops, but I’m stuck on my project and want help debugging it."
                      onChange={(
                        event,
                      ) =>
                        props.onNoteChange(
                          event.target
                            .value,
                        )
                      }
                    />
                  </label>

                  <div className="mt-2 text-right text-xs text-neutral-400 dark:text-white/35">
                    {props.note.length}
                    /2000
                  </div>
                </>
              ) : null}

              {step ===
              "review" ? (
                <>
                  <h3 className="text-xl font-semibold tracking-tight">
                    Review your request
                  </h3>
                  <p className="mt-2 ui-meta">
                    Your tutoring minutes are reserved only after you press Request tutoring. Your tutor will confirm the final schedule.
                  </p>

                  <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 dark:border-white/10">
                    {reviewRows.map(
                      (
                        row,
                        index,
                      ) => (
                        <div
                          key={
                            row.label
                          }
                          className={[
                            "flex items-start justify-between gap-5 px-4 py-3.5",
                            index
                              ? "border-t border-neutral-200 dark:border-white/10"
                              : "",
                          ].join(
                            " ",
                          )}
                        >
                          <span className="text-sm text-neutral-500 dark:text-white/45">
                            {
                              row.label
                            }
                          </span>
                          <span className="text-right text-sm font-semibold">
                            {
                              row.value
                            }
                          </span>
                        </div>
                      ),
                    )}
                  </div>

                  {props.note.trim() ? (
                    <div className="mt-4 rounded-2xl bg-neutral-50 p-4 dark:bg-white/[0.04]">
                      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-white/45">
                        Your note
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                        {
                          props.note
                        }
                      </p>
                    </div>
                  ) : null}

                  {!requestHasCredit &&
                  props.pricing ? (
                    <HumanTutoringEmbeddedCheckout
                      locale={
                        props.locale
                      }
                      requestedMinutes={
                        props.requestedMinutes
                      }
                      availableMinutes={
                        props.availableMinutes
                      }
                      pricing={
                        props.pricing
                      }
                      savedPaymentMethod={
                        props.savedPaymentMethod
                      }
                      savedPaymentMethodLoading={
                        props.savedPaymentMethodLoading
                      }
                      onAuthorizeSavedPaymentMethod={
                        props.onAuthorizeSavedPaymentMethod
                      }
                      onStartSavedCardPayment={
                        props.onStartSavedCardPayment
                      }
                      onStartCheckout={
                        props.onStartEmbeddedCheckout
                      }
                      onRefreshCredits={
                        props.onRefreshCredits
                      }
                    />
                  ) : (
                    <div className="mt-4 flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:bg-emerald-400/10 dark:text-emerald-100">
                      <span>
                        Available balance
                      </span>
                      <strong>
                        {
                          props.availableMinutes
                        }{" "}
                        min
                      </strong>
                    </div>
                  )}

                  {props.error ? (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">
                      {
                        props.error
                      }
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className="border-t border-neutral-200 bg-white px-5 py-4 dark:border-white/10 dark:bg-[#0f1218] sm:px-7">
            <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
              {stepIndex > 0 ? (
                <button
                  type="button"
                  className="ui-btn-secondary min-h-11 px-4"
                  disabled={
                    props.busy
                  }
                  onClick={
                    goBack
                  }
                >
                  <ChevronLeft
                    aria-hidden="true"
                    className="h-4 w-4"
                  />
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  className="ui-btn-secondary min-h-11 px-4"
                  disabled={
                    props.busy
                  }
                  onClick={
                    props.onClose
                  }
                >
                  Cancel
                </button>
              )}

              {!isLastStep ? (
                <button
                  type="button"
                  className="ui-btn-primary min-h-11 px-5"
                  disabled={
                    !canContinue ||
                    props.busy
                  }
                  onClick={
                    goNext
                  }
                >
                  Next
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4"
                  />
                </button>
              ) : (
                <button
                  type="button"
                  className="ui-btn-primary min-h-11 px-5"
                  disabled={
                    !canSubmit ||
                    props.busy
                  }
                  onClick={() => {
                    if (
                      !canSubmit ||
                      props.busy
                    ) {
                      return;
                    }

                    void props.onSubmit();
                  }}
                >
                  {props.busy
                    ? "Sending…"
                    : "Request tutoring"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(
    panel,
    document.body,
  );
}
