// src/lib/practice/generator/generatorTypes.ts
import { PracticeKind } from "@prisma/client";
import type { Difficulty, ExerciseKind, TopicSlug } from "../types";
import {SubjectModuleGenerator} from "@/lib/practice/generator/engines/utils";

import type { RNG } from "./shared/rng";

/**
 * Context for a single exercise generation.
 * Single source of truth:
 * - genKey is NOT part of TopicContext (it's the registry key)
 * - topicSlug is the DB canonical slug (e.g. "py0.print")
 * - variant can be null for "mixed"
 * - meta is PracticeTopic.meta (contains pool/label/etc.)
 */


export type ExerciseRole = "quiz" | "project";

export type TopicContext = {
  topicSlug: TopicSlug;

  /** null => mixed; undefined => treated as default by callers */
  variant?: string | null;

  subjectSlug?: string | null;
  moduleSlug?: string | null;
  sectionSlug?: string | null;

  meta?: any;
  preferKind?: PracticeKind | null;
   salt?: string | null;
  exerciseKey?: string | null;   // ✅ ADD THIS

  rng?: RNG | null; // ✅ not any
  // ✅ NEW: policy gates
  allowedKinds?: PracticeKind[] | null;    // allowlist by kind
  allowedRoles?: ExerciseRole[] | null;    // allowlist by role (quiz/project)

};

export type TopicGenerator = (
  rng: RNG,
  diff: Difficulty,
  id: string,
) => SubjectModuleGenerator;
export type GenFactory = (ctx: TopicContext) => TopicGenerator;
