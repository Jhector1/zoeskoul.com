"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { BookOpenCheck, Play } from "lucide-react";

import NavButton from "@/components/ui/NavButton";
import { useTaggedT } from "@/i18n/tagged";
import { resolvePracticeDisplayTitle } from "@/lib/practice/displayTitle";
import { cn } from "@/lib/cn";
import type { SubscriberPracticeSessionSummary } from "@/lib/practice/experience/practiceChooserTypes";

export default function SubscriberPracticeRail(props: {
  sessions: SubscriberPracticeSessionSummary[];
  busy: boolean;
  onResume: (
    session: SubscriberPracticeSessionSummary,
  ) => void | Promise<void>;
}) {
  const t = useTranslations("Practice.dailyStart");
  const { resolve } = useTaggedT();
  const resolveTitle = useCallback(
    (title: string, titleKey: string | null) =>
      resolvePracticeDisplayTitle({
        title,
        titleKey,
        resolve,
      }),
    [resolve],
  );

  if (!props.sessions.length) return null;

  return (
    <aside className="ui-page-surface h-fit overflow-hidden lg:sticky lg:top-6">
      <header className="border-b border-[rgb(var(--ui-border)/0.72)] bg-[rgb(var(--ui-surface-2)/0.55)] px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-[rgb(var(--ui-info)/0.22)] bg-[rgb(var(--ui-info)/0.10)] text-[rgb(var(--ui-info))]">
            <BookOpenCheck className="size-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[rgb(var(--ui-text)/0.98)]">
              {t("yourPractice")}
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-[rgb(var(--ui-text-muted)/0.76)]">
              {t("yourPracticeHelp")}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-2 p-3">
        {props.sessions.map((session, index) => {
          const topicTitle = resolveTitle(
            session.topicTitle,
            session.topicTitleKey,
          );
          const courseTitle = resolveTitle(
            session.courseTitle,
            session.courseTitleKey,
          );
          const pct = Math.round(
            (session.completedCount / Math.max(session.totalCount, 1)) * 100,
          );

          return (
            <article
              key={session.sessionId}
              className={cn(
                "rounded-xl border p-3",
                index === 0
                  ? "border-[rgb(var(--ui-info)/0.28)] bg-[rgb(var(--ui-info)/0.08)]"
                  : "border-[rgb(var(--ui-border)/0.72)] bg-[rgb(var(--ui-surface)/0.78)]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-[0.16em]",
                    index === 0
                      ? "text-[rgb(var(--ui-info))]"
                      : "text-[rgb(var(--ui-text-muted)/0.68)]",
                  )}
                >
                  {index === 0 ? t("currentPractice") : t("inProgress")}
                </span>
                <span className="text-[11px] font-medium tabular-nums text-[rgb(var(--ui-text-muted)/0.72)]">
                  {session.completedCount}/{session.totalCount}
                </span>
              </div>

              <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[rgb(var(--ui-text)/0.96)]">
                {topicTitle}
              </h3>
              <p className="mt-1 truncate text-xs text-[rgb(var(--ui-text-muted)/0.74)]">
                {courseTitle}
              </p>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--ui-border)/0.55)]">
                <div
                  className="h-full rounded-full bg-[rgb(var(--ui-info))] transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                />
              </div>

              <NavButton
                onClick={() => props.onResume(session)}
                disabled={props.busy}
                className="ui-btn-secondary mt-3 min-h-9 w-full px-3"
                loadingText={t("continuing")}
              >
                <span className="inline-flex items-center gap-2">
                  <Play className="size-3.5" />
                  {t("continuePractice")}
                </span>
              </NavButton>
            </article>
          );
        })}
      </div>
    </aside>
  );
}
