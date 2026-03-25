"use client";

import type { VectorPadState } from "@/components/vectorpad/types";
import type { Difficulty } from "@/lib/practice/types";
import { usePracticeInstanceBase } from "@/lib/practice/runtime/usePracticeInstanceBase";

type LoadArgs = {
  subject?: string;
  module?: string;
  section?: string;
  topic?: string;
  difficulty?: Difficulty;
  allowReveal?: boolean;
  sessionId?: string;
  preferKind?: string;
  salt?: string;

  preferPurpose?: string;
  purposePolicy?: string;
  exerciseKey?: string;
  seedPolicy?: string;
};

export function usePracticeInstance(args: {
  load: LoadArgs;
  maxAttempts: number;
  padRef?: React.MutableRefObject<VectorPadState | null>;
}) {
  return usePracticeInstanceBase(args);
}