"use client";

import { createPortal } from "react-dom";
import { useTranslations, useLocale } from "next-intl";

import {
  createLearnerHeader,
  type LearnerHeaderBillingSnapshot,
  type LearnerHeaderTranslate,
} from "@zoeskoul/learner-ui";
import {
  ROUTES,
  getLocalAppOrigin,
} from "@zoeskoul/app-config";

import {
  useStudentSession,
} from "../../app/studentSession";
import {
  buildStudentLogoutUrl,
} from "../../app/studentLogout";
import StudentUserMenuSlick from "@student/components/chrome/StudentUserMenuSlick";
import StudentLocaleSwitcher from "@student/components/chrome/StudentLocaleSwitcher";
import { Link, usePathname } from "@student/i18n/navigation";
import Badge from "@/components/billing/Badge";
import BillingPromotionCountdown from "@/components/billing/BillingPromotionCountdown";
import { useBillingStatus } from "@/components/billing/hooks/useBillingStatus";
import SoundToggle from "@/lib/sfx/SoundToggle";
import { useAuthHref } from "@student/hooks/useAuthHref";
import { startGlobalNavigationPending } from "@/components/navigation/GlobalNavigationProgress";
import LearningEntryButton from "@/components/learning/LearningEntryButton";
import PracticeEntryButton from "@/components/practice/PracticeEntryButton";
import NavButton from "@/components/ui/NavButton";

const websiteOrigin =
  import.meta.env.VITE_WEBSITE_ORIGIN ??
  getLocalAppOrigin("website");

function useLearnerHeaderTranslations(
  namespace: "Header" | "billing",
): LearnerHeaderTranslate {
  return useTranslations(namespace as never) as unknown as LearnerHeaderTranslate;
}

function useStudentHeaderSession() {
  const { data, status } = useStudentSession();

  return {
    data: data
      ? {
          user: data.user ?? undefined,
        }
      : data,
    status,
  };
}

function useStudentHeaderPathname(): string {
  return usePathname() ?? "/";
}

function useStudentHeaderBilling(): LearnerHeaderBillingSnapshot {
  const snapshot = useBillingStatus();

  return {
    status: snapshot.status,
    headlineBadge: snapshot.headlineBadge,
    reload: snapshot.reload,
  } as unknown as LearnerHeaderBillingSnapshot;
}

const learnerHeader = createLearnerHeader({
  appName: "ZoeSkoul",
  routes: ROUTES,
  authenticatedNavIsExternal: false,
  defaultWebsiteOrigin: websiteOrigin,

  Link,
  UserMenu: StudentUserMenuSlick,
  LocaleSwitcher: StudentLocaleSwitcher,
  Badge,
  BillingPromotionCountdown,
  SoundToggle,
  LearningEntryButton,
  PracticeEntryButton,
  NavButton,

  createPortal,
  useTranslations: useLearnerHeaderTranslations,
  useLocale,
  useSession: useStudentHeaderSession,
  usePathname: useStudentHeaderPathname,
  useAuthHref,
  useBillingStatus: useStudentHeaderBilling,

  buildAuthenticatedAppHref: ({ pathname }) => pathname,

  hardLogout: ({
    locale,
    websiteOrigin: explicitWebsiteOrigin,
  }) => {
    startGlobalNavigationPending({
      label: "Logging out…",
      description: "Closing your session securely.",
      source: "logout",
      minVisibleMs: 700,
    });

    window.location.assign(
      buildStudentLogoutUrl({
        websiteOrigin:
          explicitWebsiteOrigin ??
          websiteOrigin,
        locale,
      }),
    );
  },

  useResumeCheckout: ({
    billingStatus,
    websiteOrigin: explicitWebsiteOrigin,
  }) => {
    if (!billingStatus?.pendingCheckout) return null;

    try {
      return {
        kind: "link" as const,
        testId: "student-header-resume-checkout",
        href: new URL(
          "/api/billing/checkout/resume",
          explicitWebsiteOrigin ??
            websiteOrigin,
        ).toString(),
      };
    } catch {
      return null;
    }
  },
});

export const SettingsMenu = learnerHeader.SettingsMenu;
export const LearnHeaderSlick = learnerHeader.LearnHeaderSlick;
export default learnerHeader.HeaderSlick;
