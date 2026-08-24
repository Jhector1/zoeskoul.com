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
