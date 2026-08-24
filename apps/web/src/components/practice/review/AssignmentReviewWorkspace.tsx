"use client";

import React from "react";
import type { PracticeShellProps } from "@/components/practice/PracticeShell";
import PracticeReviewWorkspace from "./PracticeReviewWorkspace";

/**
 * Compatibility wrapper for callers that still import the old assignment-only
 * component. New routing should use the shared embedded workspace directly.
 */
export default function AssignmentReviewWorkspace(
  props: PracticeShellProps,
) {
  return <PracticeReviewWorkspace {...props} />;
}
