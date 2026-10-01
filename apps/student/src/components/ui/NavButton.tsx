"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { usePathname, useRouter } from "@student/i18n/navigation";
import { routing } from "@student/i18n/routing";
import { createNavButton } from "@zoeskoul/learner-workspace/navigation/NavButton";

type RouterHref =
  Parameters<ReturnType<typeof useRouter>["push"]>[0];

function useDefaultNavigationLoadingText() {
  const t = useTranslations("Header");
  return t("navigationLoading");
}

const NavButton = createNavButton<RouterHref>({
  useRouter,
  usePathname,
  useSearchParams,
  locales: routing.locales,
  useDefaultLoadingText: useDefaultNavigationLoadingText,
});

export default NavButton;
