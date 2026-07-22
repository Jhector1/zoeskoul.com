"use client";

import type { ReactNode } from "react";

import NavButton from "@/components/ui/NavButton";

type EntryActionButtonProps = {
  href?: string;
  label: ReactNode;
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  loadingText?: ReactNode;
  onClick?: () => void | Promise<void>;
  prefetch?: boolean;
};

/**
 * Shared navigation-button presentation for the header and home entry actions.
 * Route ownership stays with the feature-specific wrapper; spinner, icon, and
 * label layout stay consistent here.
 */
export default function EntryActionButton({
  href,
  label,
  className,
  disabled = false,
  fullWidth = false,
  icon,
  loadingText,
  onClick,
  prefetch = true,
}: EntryActionButtonProps) {
  return (
    <NavButton
      href={href}
      onClick={onClick}
      className={className}
      disabled={disabled}
      fullWidth={fullWidth}
      loadingText={loadingText}
      prefetch={prefetch}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {icon}
        <span>{label}</span>
      </span>
    </NavButton>
  );
}
