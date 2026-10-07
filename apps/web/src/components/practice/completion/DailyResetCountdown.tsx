"use client";

import React from "react";
import { useTranslations } from "next-intl";
import SharedDailyResetCountdown, {
  type DailyResetCountdownProps as SharedDailyResetCountdownProps,
} from "@zoeskoul/learner-workspace/practice/completion/DailyResetCountdown";

type DailyResetCountdownProps = Pick<
  SharedDailyResetCountdownProps,
  "nextResetAt" | "compact"
>;

export default function DailyResetCountdown(
  props: DailyResetCountdownProps,
) {
  const t = useTranslations(
    "Practice.completion.daily",
  );

  return (
    <SharedDailyResetCountdown
      {...props}
      nextLabel={t("nextLabel")}
      readyLabel={t("ready")}
      utcNote={t("utcNote")}
      formatCountdown={({
        hours,
        minutes,
        seconds,
      }) =>
        t("countdown", {
          hours,
          minutes,
          seconds,
        })
      }
    />
  );
}
