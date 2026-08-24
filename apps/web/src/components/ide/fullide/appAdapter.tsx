"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

import { SettingsMenu } from "@/components/HeaderSlick";

export function useFullIDEAuthenticatedUserId(): string | null {
  const { data: session } = useSession();
  return session?.user?.id ?? null;
}

export const useFullIDERouter = useRouter;
export const FullIDELink = Link;
export const useFullIDETranslations = useTranslations;
export const FullIDESettingsMenu = SettingsMenu;
