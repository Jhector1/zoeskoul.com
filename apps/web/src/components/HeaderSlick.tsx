"use client";

import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";

import {
  createLearnerHeader,
  type LearnerHeaderBillingSnapshot,
  type LearnerHeaderTranslate,
} from "@zoeskoul/learner-ui";
import { ROUTES } from "@zoeskoul/app-config";

import UserMenuSlick from "./UserMenuSlick";
import LocaleSwitcher from "./LocaleSwitcher";
import { Link, usePathname } from "@/i18n/navigation";
import Badge from "@/components/billing/Badge";
import BillingPromotionCountdown from "@/components/billing/BillingPromotionCountdown";
import { useBillingStatus } from "@/components/billing/hooks/useBillingStatus";
import { useBillingActions } from "@/components/billing/hooks/useBillingActions";
import SoundToggle from "@/lib/sfx/SoundToggle";
import { useAuthHref } from "@/hooks/useAuthHref";
import { startGlobalNavigationPending } from "@/components/navigation/GlobalNavigationProgress";
import LearningEntryButton from "@/components/learning/LearningEntryButton";
import PracticeEntryButton from "@/components/practice/PracticeEntryButton";
import NavButton from "@/components/ui/NavButton";
import { buildStudentAppHref } from "@/lib/navigation/studentAppHref";
import { buildWebLogoutUrl } from "@/lib/auth/logout";

function useLearnerHeaderTranslations(
  namespace: "Header" | "billing",
): LearnerHeaderTranslate {
  return useTranslations(namespace as never) as unknown as LearnerHeaderTranslate;
}

function useWebHeaderSession() {
  const { data, status } = useSession();

  return {
    data: data
      ? {
          user: data.user ?? undefined,
        }
      : data,
    status,
  };
}

function useWebHeaderPathname(): string {
  return usePathname() ?? "/";
}

function useWebHeaderBilling(): LearnerHeaderBillingSnapshot {
  const snapshot = useBillingStatus();

  return {
    status: snapshot.status,
    headlineBadge: snapshot.headlineBadge,
    reload: snapshot.reload,
    setError: snapshot.setError,
  } as unknown as LearnerHeaderBillingSnapshot;
}

const learnerHeader = createLearnerHeader({
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "ZoeSkoul",
  routes: ROUTES,
  authenticatedNavIsExternal: true,

  Link,
  UserMenu: UserMenuSlick,
  LocaleSwitcher,
  Badge,
  BillingPromotionCountdown,
  SoundToggle,
  LearningEntryButton,
  PracticeEntryButton,
  NavButton,

  createPortal,
  useTranslations: useLearnerHeaderTranslations,
  useLocale,
  useSession: useWebHeaderSession,
  usePathname: useWebHeaderPathname,
  useAuthHref,
  useBillingStatus: useWebHeaderBilling,

  buildAuthenticatedAppHref: buildStudentAppHref,

  hardLogout: ({ locale }) => {
    startGlobalNavigationPending({
      label: "Logging out…",
      description: "Closing your session securely.",
      source: "logout",
      minVisibleMs: 700,
    });

    window.location.assign(
      buildWebLogoutUrl({
        websiteOrigin: window.location.origin,
        locale,
      }),
    );
  },

  useResumeCheckout: ({
    billingStatus,
    callbackUrl,
    setBillingError,
  }) => {
    const localStatus =
      billingStatus as ReturnType<typeof useBillingStatus>["status"];

    const {
      busy,
      startCheckout,
    } = useBillingActions({
      status: localStatus,
      callbackUrl,
      onError: setBillingError ?? (() => undefined),
    });

    if (!localStatus?.pendingCheckout) return null;

    return {
      kind: "button" as const,
      testId: "header-resume-checkout",
      busy,
      onActivate: () => {
        void startCheckout(
          localStatus.pendingCheckout!.plan,
          localStatus.pendingCheckout!.useTrial,
        );
      },
    };
  },
});

export const SettingsMenu = learnerHeader.SettingsMenu;
export const LearnHeaderSlick = learnerHeader.LearnHeaderSlick;
export default learnerHeader.HeaderSlick;
