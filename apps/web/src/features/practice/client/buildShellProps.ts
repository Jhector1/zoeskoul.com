// src/features/practice/client/buildShellProps.ts
import type React from "react";
import PracticeShell from "@/components/practice/PracticeShell";

export function buildShellProps(
  p: React.ComponentProps<typeof PracticeShell>,
): React.ComponentProps<typeof PracticeShell> {
  return p;
}
