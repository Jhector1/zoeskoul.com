"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { countdownParts } from "@/lib/practice/experience/completion";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export default function DailyResetCountdown(props: {
  nextResetAt?: string | null;
  compact?: boolean;
}) {
  const t = useTranslations("Practice.completion.daily");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!props.nextResetAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [props.nextResetAt]);

  const countdown = useMemo(
    () => countdownParts(props.nextResetAt, now),
    [now, props.nextResetAt],
  );

  if (!props.nextResetAt) return null;

  return (
    <div
      className={
        props.compact
          ? "rounded-xl border border-[rgb(var(--ui-border)/0.8)] bg-[rgb(var(--ui-surface-2)/0.72)] p-3"
          : "mt-4 rounded-2xl border border-[rgb(var(--ui-border)/0.8)] bg-[rgb(var(--ui-surface-2)/0.72)] p-4"
      }
    >
      <div className="ui-kicker">{t("nextLabel")}</div>
      <div className="mt-1 text-lg font-black tabular-nums text-[rgb(var(--ui-text))]">
        {countdown.ready
          ? t("ready")
          : t("countdown", {
              hours: pad(countdown.hours),
              minutes: pad(countdown.minutes),
              seconds: pad(countdown.seconds),
            })}
      </div>
      <div className="mt-1 text-xs text-[rgb(var(--ui-text-muted))]">
        {t("utcNote")}
      </div>
    </div>
  );
}
