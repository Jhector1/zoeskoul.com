import "server-only";

import type {
  LearningRuntimeTarget,
} from "@zoeskoul/learning-contracts";

import type { Actor } from "@/lib/practice/actor";
import type { ReviewModule } from "@zoeskoul/curriculum-contracts/subjects/types";

import {
  buildStudentRuntimePracticeLaunch,
  type StudentRuntimePracticeLaunchResult,
} from "./studentRuntimePracticeLaunch";

export type StudentSimpleQuizPracticeLaunchResult =
  StudentRuntimePracticeLaunchResult;

/**
 * Compatibility wrapper for older server imports. New callers should use the
 * runtime-wide builder so quiz and embedded Try It launch logic stays shared.
 */
export async function buildStudentSimpleQuizPracticeLaunch(
  args: {
    request: Request;
    actor: Actor;
    locale: string;
    subjectSlug: string;
    moduleSlug: string;
    reviewModule: ReviewModule;
    target: LearningRuntimeTarget;
  },
): Promise<StudentSimpleQuizPracticeLaunchResult> {
  return buildStudentRuntimePracticeLaunch(args);
}
