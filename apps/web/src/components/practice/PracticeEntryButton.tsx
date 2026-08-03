"use client";

import type { ReactNode } from "react";
import { useLocale } from "next-intl";

import EntryActionButton from "@/components/navigation/EntryActionButton";
import { buildStudentAppHref } from "@/lib/navigation/studentAppHref";
import { buildPracticeEntryHref } from "@/lib/practice/entry";

type PracticeEntryButtonProps = {
  isAuthenticated: boolean;
  authenticatedLabel: ReactNode;
  guestLabel: ReactNode;
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  loadingText?: ReactNode;
  onGuestClick?: () => void | Promise<void>;
  prefetch?: boolean;
};

export default function PracticeEntryButton({
  isAuthenticated,
  authenticatedLabel,
  guestLabel,
  className,
  disabled = false,
  fullWidth = false,
  icon,
  loadingText,
  onGuestClick,
  prefetch = true,
}: PracticeEntryButtonProps) {
  const locale = useLocale();
  const localHref =
    !isAuthenticated && onGuestClick
      ? undefined
      : buildPracticeEntryHref(isAuthenticated);
  const href =
    isAuthenticated && localHref
      ? buildStudentAppHref({
          pathname: localHref,
          locale,
        })
      : localHref;

  return (
    <EntryActionButton
      href={href}
      onClick={!isAuthenticated ? onGuestClick : undefined}
      label={isAuthenticated ? authenticatedLabel : guestLabel}
      className={className}
      disabled={disabled}
      fullWidth={fullWidth}
      icon={icon}
      loadingText={loadingText}
      prefetch={prefetch}
    />
  );
}
