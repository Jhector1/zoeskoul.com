import {
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  loadActiveStudentCampaigns,
  recordStudentCampaignEvent,
  type StudentCampaign,
} from "./studentCampaignClient";

function localizedInternalHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) {
    return href;
  }

  if (/^\/(?:en|es|fr|ht)(?:\/|$)/.test(href)) {
    return href;
  }

  const locale =
    window.location.pathname.match(
      /^\/(en|es|fr|ht)(?:\/|$)/,
    )?.[1] ?? "en";

  return `/${locale}${href}`;
}

function formatCampaignRemaining(
  endsAt: string,
  nowMs: number,
) {
  const remaining =
    new Date(endsAt).getTime() -
    nowMs;

  if (remaining <= 0) {
    return "Ending now";
  }

  const totalMinutes =
    Math.max(
      1,
      Math.floor(
        remaining / 60_000,
      ),
    );

  const days =
    Math.floor(
      totalMinutes /
        (24 * 60),
    );
  const hours =
    Math.floor(
      (totalMinutes %
        (24 * 60)) /
        60,
    );
  const minutes =
    totalMinutes % 60;

  if (days > 0) {
    return `Ends in ${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `Ends in ${hours}h ${minutes}m`;
  }

  return `Ends in ${minutes}m`;
}

function navigateCampaignCta(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) {
    window.location.assign(href);
    return;
  }

  const target =
    localizedInternalHref(href);

  window.history.pushState(
    {},
    "",
    target,
  );

  window.dispatchEvent(
    new Event(
      "zoeskoul:vite-navigation",
    ),
  );
}

export function StudentCampaignHost(props: {
  apiOrigin: string;
}) {
  const [campaign, setCampaign] =
    useState<StudentCampaign | null>(null);

  const [nowMs, setNowMs] =
    useState(() => Date.now());

  const impressionRef =
    useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    void loadActiveStudentCampaigns(
      props.apiOrigin,
    )
      .then((payload) => {
        if (!active) return;
        setCampaign(
          payload.campaigns[0] ?? null,
        );
      })
      .catch(() => {
        if (!active) return;
        setCampaign(null);
      });

    return () => {
      active = false;
    };
  }, [props.apiOrigin]);

  useEffect(() => {
    if (!campaign) return;

    setNowMs(Date.now());

    const timer =
      window.setInterval(
        () => {
          setNowMs(
            Date.now(),
          );
        },
        30_000,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [campaign]);

  useEffect(() => {
    if (
      !campaign ||
      impressionRef.current ===
        campaign.id
    ) {
      return;
    }

    impressionRef.current =
      campaign.id;

    void recordStudentCampaignEvent(
      props.apiOrigin,
      campaign.id,
      "impression",
    ).catch(() => {
      // Rendering does not depend on analytics availability.
    });
  }, [
    campaign,
    props.apiOrigin,
  ]);

  async function closeForNow() {
    const current = campaign;
    if (!current) return;

    setCampaign(null);

    try {
      await recordStudentCampaignEvent(
        props.apiOrigin,
        current.id,
        "dismiss",
      );
    } catch {
      // Closing never depends on analytics availability.
    }
  }

  async function dontShowAgain() {
    const current = campaign;
    if (!current) return;

    setCampaign(null);

    try {
      await recordStudentCampaignEvent(
        props.apiOrigin,
        current.id,
        "dont_show_again",
      );
    } catch {
      // Local closing still succeeds if persistence is temporarily unavailable.
    }
  }

  useEffect(() => {
    if (!campaign) return;

    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        void closeForNow();
      }
    };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
    };
  }, [campaign]);

  function activateCta() {
    const href = campaign?.ctaHref;
    if (!href || !campaign) {
      void closeForNow();
      return;
    }

    const current = campaign;
    setCampaign(null);

    void recordStudentCampaignEvent(
      props.apiOrigin,
      current.id,
      "dismiss",
    ).catch(() => {});

    navigateCampaignCta(href);
  }

  if (
    !campaign ||
    typeof document === "undefined"
  ) {
    return null;
  }

  const modal = (
    <div
      className="fixed inset-0 z-[190] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          void closeForNow();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-campaign-title"
        className="relative w-full max-w-lg overflow-hidden rounded-t-3xl border border-neutral-200 bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8 dark:border-white/10 dark:bg-neutral-950"
      >
        <button
          type="button"
          aria-label="Close announcement"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-white text-lg text-neutral-600 transition hover:bg-neutral-50 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
          onClick={() => void closeForNow()}
        >
          ×
        </button>

        <div className="pr-8">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
            ZoeSkoul update
          </div>

          <h2
            id="student-campaign-title"
            className="mt-3 text-2xl font-extrabold tracking-tight text-neutral-950 dark:text-white"
          >
            {campaign.title}
          </h2>

          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-600 dark:text-white/70">
            {campaign.body}
          </p>

          {campaign.tutoringGrantMinutes ? (
            <div className="mt-5 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
              {campaign.tutoringGrantMinutes} promotional tutoring minutes
            </div>
          ) : null}

          <div className="mt-4 text-sm font-bold text-neutral-700 dark:text-white/75">
            {formatCampaignRemaining(
              campaign.endsAt,
              nowMs,
            )}
          </div>
        </div>

        <div className="mt-7">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 dark:border-white/10 dark:text-white/75 dark:hover:bg-white/5"
              onClick={() => void closeForNow()}
            >
              Not now
            </button>

            {campaign.ctaLabel &&
            campaign.ctaHref ? (
              <button
                type="button"
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700"
                onClick={activateCta}
              >
                {campaign.ctaLabel}
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className="mt-4 w-full text-center text-xs font-semibold text-neutral-500 underline underline-offset-4 transition hover:text-neutral-800 dark:text-white/45 dark:hover:text-white/75"
            onClick={() =>
              void dontShowAgain()
            }
          >
            Don&apos;t show this campaign again
          </button>
        </div>
      </section>
    </div>
  );

  return createPortal(
    modal,
    document.body,
  );
}
