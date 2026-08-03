"use client";

import React from "react";
import type { PracticeShellProps } from "@/components/practice/PracticeShell";
import EmbeddedPracticeReviewWorkspace from "./EmbeddedPracticeReviewWorkspace";
import {
  resolveEmbeddedPracticeWorkspacePresentation,
} from "@/lib/practice/experience/embeddedWorkspace";

/**
 * Compatibility wrapper for callers that still import the old assignment-only
 * component. New routing should use the shared embedded workspace directly.
 */
export default function AssignmentReviewWorkspace(props: PracticeShellProps) {
  const presentation =
    resolveEmbeddedPracticeWorkspacePresentation("assignment");

  if (!presentation) return null;

  return (
    <EmbeddedPracticeReviewWorkspace
      props={props}
      presentation={presentation}
    />
  );
}
