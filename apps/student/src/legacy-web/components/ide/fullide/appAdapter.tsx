"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useStudentSession } from "../../../../app/studentSession";
import { SettingsMenu } from "@student/components/chrome/StudentHeaderSlick";

export function useFullIDEAuthenticatedUserId(): string | null {
  const { data: session } = useStudentSession();
  return typeof session?.user?.id === "string" && session.user.id
    ? session.user.id
    : null;
}

export const useFullIDERouter = useRouter;
export const FullIDELink = Link;
export const useFullIDETranslations = useTranslations;
export const FullIDESettingsMenu = SettingsMenu;

import type { ReactNode } from "react";
import {
  LearnerWorkspaceRuntimeProvider,
  setLearnerWorkspaceStaticConfig,
  type LearnerWorkspaceRuntime,
} from "@zoeskoul/learner-workspace/runtime/appRuntime";

setLearnerWorkspaceStaticConfig({
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "app",
  nodeEnv: process.env.NODE_ENV ?? "development",
  env: {
      NEXT_PUBLIC_TERMINAL_MODE: process.env.NEXT_PUBLIC_TERMINAL_MODE,
      NEXT_PUBLIC_ZOE_COMPACT_LEARNER_UI: process.env.NEXT_PUBLIC_ZOE_COMPACT_LEARNER_UI,
      NEXT_PUBLIC_ZOE_DEBUG_LEARNING_UI: process.env.NEXT_PUBLIC_ZOE_DEBUG_LEARNING_UI,
  },
});

const learnerWorkspaceRuntime: LearnerWorkspaceRuntime = {
  useTranslations: useFullIDETranslations,
  useAuthenticatedUserId: useFullIDEAuthenticatedUserId,
  useRouter: useFullIDERouter,
  Link: FullIDELink,
  SettingsMenu: FullIDESettingsMenu,
};

export function LearnerWorkspaceAppRuntimeProvider(props: {
  children: ReactNode;
}) {
  return (
    <LearnerWorkspaceRuntimeProvider runtime={learnerWorkspaceRuntime}>
      {props.children}
    </LearnerWorkspaceRuntimeProvider>
  );
}
