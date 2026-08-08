"use client";

import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@zoeskoul/learner-ui/lib/cn";
import {
  useOptionalReviewDestinationTransition,
} from "@/components/review/module/navigation/ReviewDestinationTransitionContext";

function ReviewExerciseCardSkeleton({ minHeight }: { minHeight: number }) {
  return (
    <div
      className="ui-page-surface h-full w-full p-4"
      style={{ minHeight }}
      data-testid="review-exercise-transition-skeleton"
      aria-hidden="true"
    >
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-2/5 rounded bg-[rgb(var(--ui-border)/0.58)]" />
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-[rgb(var(--ui-border)/0.46)]" />
          <div className="h-4 w-5/6 rounded bg-[rgb(var(--ui-border)/0.46)]" />
          <div className="h-4 w-3/5 rounded bg-[rgb(var(--ui-border)/0.46)]" />
        </div>
        <div className="min-h-28 rounded-xl border border-[rgb(var(--ui-border)/0.7)] bg-[rgb(var(--ui-muted)/0.5)] p-3">
          <div className="h-3 w-1/4 rounded bg-[rgb(var(--ui-border)/0.5)]" />
          <div className="mt-3 h-4 w-3/4 rounded bg-[rgb(var(--ui-border)/0.42)]" />
          <div className="mt-2 h-4 w-1/2 rounded bg-[rgb(var(--ui-border)/0.42)]" />
        </div>
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="h-10 w-36 rounded-full bg-[rgb(var(--ui-primary)/0.24)]" />
          <div className="h-4 w-24 rounded bg-[rgb(var(--ui-border)/0.48)]" />
        </div>
      </div>
    </div>
  );
}

export default function ReviewExerciseTransitionBoundary({
  active,
  ready,
  ownerKey,
  children,
}: {
  active: boolean;
  ready: boolean;
  ownerKey: string | null;
  children: React.ReactNode;
}) {
  const transition = useOptionalReviewDestinationTransition();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastPromptMarkOwnerRef = useRef<string | null>(null);
  const [settledHeight, setSettledHeight] = useState(420);
  const showSkeleton = Boolean(
    active &&
    transition?.showExerciseSkeleton,
  );

  useEffect(() => {
    const element = contentRef.current;
    if (!element || showSkeleton || typeof ResizeObserver === "undefined") return;

    const update = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (height > 0) setSettledHeight(height);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [showSkeleton]);

  useEffect(() => {
    if (!active || showSkeleton) return;

    const markOwner = ownerKey ?? "local";
    if (lastPromptMarkOwnerRef.current === markOwner) return;
    lastPromptMarkOwnerRef.current = markOwner;

    if (typeof performance === "undefined" || typeof performance.mark !== "function") {
      return;
    }

    performance.mark("exercise_prompt_rendered", {
      detail: {
        ownerKey: markOwner,
      },
    });
  }, [active, ownerKey, showSkeleton]);

  useEffect(() => {
    const destinationIdentity = transition?.destinationIdentity;
    if (
      !active ||
      !destinationIdentity ||
      !transition.destinationPublished
    ) {
      return;
    }

    transition.reportExerciseReady({
      destinationIdentity,
      ownerKey,
      ready,
    });
  }, [
    active,
    ownerKey,
    ready,
    transition,
  ]);

  return (
    <div
      className="relative w-full"
      style={showSkeleton ? { minHeight: settledHeight } : undefined}
      data-review-exercise-transition-owner={active ? ownerKey ?? "local" : undefined}
    >
      <div
        ref={contentRef}
        className={cn(
          "w-full",
          showSkeleton && "invisible pointer-events-none select-none",
        )}
        aria-hidden={showSkeleton || undefined}
      >
        {children}
      </div>

      {showSkeleton ? (
        <div className="absolute inset-0 z-10 w-full">
          <ReviewExerciseCardSkeleton minHeight={settledHeight} />
        </div>
      ) : null}
    </div>
  );
}
