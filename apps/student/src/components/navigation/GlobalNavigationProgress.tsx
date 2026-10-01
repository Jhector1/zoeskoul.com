"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import {
  GlobalNavigationProgress as SharedGlobalNavigationProgress,
} from "@zoeskoul/learner-workspace/navigation/GlobalNavigationProgress";

export {
  GLOBAL_NAVIGATION_IDLE_EVENT,
  GLOBAL_NAVIGATION_PENDING_EVENT,
  startGlobalNavigationPending,
  stopGlobalNavigationPending,
} from "@zoeskoul/learner-workspace/navigation/GlobalNavigationProgress";

export function GlobalNavigationProgress() {
  const pathname = usePathname();
  const t = useTranslations("Header");

  return (
    <SharedGlobalNavigationProgress
      pathname={pathname}
      defaultLabel={t("navigationLoading")}
    />
  );
}
