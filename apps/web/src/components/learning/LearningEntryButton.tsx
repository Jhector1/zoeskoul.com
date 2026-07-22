"use client";

import { useEffect, useState, type ReactNode } from "react";

import EntryActionButton from "@/components/navigation/EntryActionButton";
import {
  createStartLearningEntry,
  parseLearningEntry,
  type LearningEntry,
} from "@/lib/learning/entry";

type LearningEntryButtonProps = {
  isAuthenticated: boolean;
  continueLabel: ReactNode;
  startLabel: ReactNode;
  guestLabel: ReactNode;
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  loadingText?: ReactNode;
  prefetch?: boolean;
};

export default function LearningEntryButton({
  isAuthenticated,
  continueLabel,
  startLabel,
  guestLabel,
  className,
  disabled = false,
  fullWidth = false,
  icon,
  loadingText,
  prefetch = true,
}: LearningEntryButtonProps) {
  const [entry, setEntry] = useState<LearningEntry | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setEntry(createStartLearningEntry());
      return;
    }

    const controller = new AbortController();

    void fetch("/api/learning/entry", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return parseLearningEntry(await response.json());
      })
      .then((resolved) => {
        if (controller.signal.aborted) return;
        setEntry(resolved ?? createStartLearningEntry());
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("[learning-entry] Could not load the latest lesson", error);
        setEntry(createStartLearningEntry());
      });

    return () => controller.abort();
  }, [isAuthenticated]);

  const resolvedEntry = entry ?? createStartLearningEntry();
  const label = !isAuthenticated
    ? guestLabel
    : entry?.kind === "start"
      ? startLabel
      : continueLabel;

  return (
    <EntryActionButton
      href={resolvedEntry.href}
      label={label}
      className={className}
      disabled={disabled}
      fullWidth={fullWidth}
      icon={icon}
      loadingText={loadingText}
      prefetch={prefetch && entry !== null}
    />
  );
}
