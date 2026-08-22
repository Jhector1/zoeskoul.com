"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { countdownParts } from "@/lib/practice/experience/completion";
import { formatPromotionCountdown } from "@zoeskoul/learner-ui/lib/billing/promotionCountdown";

export default function BillingPromotionCountdown({
  endsAt,
  onExpire,
  compact = false,
}: {
  endsAt: string;
  onExpire?: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("billing.promotion");
  const [now, setNow] = useState(() => Date.now());
  const notified = useRef(false);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const countdown = useMemo(
    () => countdownParts(endsAt, now),
    [endsAt, now],
  );

  useEffect(() => {
    if (countdown.ready && !notified.current) {
      notified.current = true;
      onExpire?.();
    }
  }, [countdown.ready, onExpire]);

  return (
    <div
      className={
        compact
          ? "text-[11px] font-medium tabular-nums text-amber-700 dark:text-amber-300"
          : "mt-2 text-xs font-medium tabular-nums text-amber-700 dark:text-amber-300"
      }
    >
      {countdown.ready
        ? t("ended")
        : `${t("endsIn")} ${formatPromotionCountdown(countdown.remainingMs)}`}
    </div>
  );
}
