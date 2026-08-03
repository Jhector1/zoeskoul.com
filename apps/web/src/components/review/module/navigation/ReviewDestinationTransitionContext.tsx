"use client";

import React, {
  createContext,
  useContext,
} from "react";

export type ReviewDestinationTransitionValue = {
  isDestinationTransitioning: boolean;
  showExerciseSkeleton: boolean;
  showEditorLoading: boolean;
  destinationIdentity: string | null;
  destinationPublished: boolean;
  destinationReady: boolean;
  expectedExerciseOwnerKey: string | null;
  expectedGeneration: number;
  reportExerciseReady: (args: {
    destinationIdentity: string;
    ownerKey: string | null;
    ready: boolean;
  }) => void;
  reportEditorReady: (args: {
    destinationIdentity: string;
    ownerKey: string | null;
    generation: number;
    ready: boolean;
  }) => void;
};

const ReviewDestinationTransitionContext =
  createContext<ReviewDestinationTransitionValue | null>(null);

export function ReviewDestinationTransitionProvider({
  value,
  children,
}: {
  value: ReviewDestinationTransitionValue;
  children: React.ReactNode;
}) {
  return (
    <ReviewDestinationTransitionContext.Provider value={value}>
      {children}
    </ReviewDestinationTransitionContext.Provider>
  );
}

export function useOptionalReviewDestinationTransition() {
  return useContext(ReviewDestinationTransitionContext);
}
