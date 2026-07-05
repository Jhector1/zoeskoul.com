import type {
  Difficulty,
  Exercise,
  TopicSlug,
  ValidateResponse,
  Vec3,
} from "@/lib/practice/types";
import type { MissedItem } from "@/lib/practice/uiTypes";
import type { SessionHistoryRow } from "@/lib/practice/runtime/types";
import type {
  PracticeExperienceFilters,
  PracticeExperienceMode,
  PracticeRunViewer,
} from "@/lib/practice/experience/types";

export type PracticeChallengeRunMeta = {
  exerciseKey: string;
  title: string;
  maxAttempts: number | null;
  attemptsUsed?: number;
};

/**
 * One run contract for every practice experience. Components should branch on
 * `mode`, never on assignmentId or ad-hoc JSON metadata.
 */
export type PracticeRunMetaApi = {
  mode: PracticeExperienceMode;
  label: string;
  allowReveal: boolean;
  showDebug: boolean;
  maxAttempts: number | null;
  targetCount: number;
  returnUrl?: string | null;
  lockDifficulty: Difficulty | null;
  lockTopic: "all" | TopicSlug | null;
  filters: PracticeExperienceFilters;
  viewer: PracticeRunViewer;
  challenge?: PracticeChallengeRunMeta | null;
  help?: { stepKeys: string[] } | null;
};

export type PracticeAttemptsInfo = {
  used?: number;
  left?: number | null;
  max?: number | null;
};

export type PracticeRevealVectors = {
  solutionA?: Vec3;
  b?: Vec3;
};

export type PracticeValidateClientResponse = ValidateResponse & {
  attempts?: PracticeAttemptsInfo;
  finalized?: boolean;

  sessionComplete?: boolean;
  returnUrl?: string | null;
  run?: PracticeRunMetaApi | null;

  reveal?: PracticeRevealVectors | null;
  revealAnswer?: PracticeRevealVectors | null;

  expected?: any;
  explanation?: string | null;
  message?: string | null;
};

export type PracticeExerciseGetResponse = {
  complete?: false;
  exercise: Exercise;
  key: string;

  sessionId?: string | null;
  run?: PracticeRunMetaApi | null;
  returnUrl?: string | null;

  explanation?: string | null;
  message?: string | null;
};

export type PracticeCompletedGetResponse = {
  complete: true;
  sessionId?: string | null;

  run?: PracticeRunMetaApi | null;
  returnUrl?: string | null;

  answeredCount?: number;
  totalCount?: number;
  correctCount?: number;
  targetCount?: number;

  missed?: MissedItem[];
  history?: SessionHistoryRow[];

  explanation?: string | null;
  message?: string | null;
};

export type PracticeStatusResponse = {
  sessionId: string;
  complete: boolean;

  answeredCount?: number;
  totalCount?: number;
  correctCount?: number;
  targetCount?: number;

  missed?: MissedItem[];
  history?: SessionHistoryRow[];

  run?: PracticeRunMetaApi | null;
  returnUrl?: string | null;

  explanation?: string | null;
  message?: string | null;
};

export type PracticeGetResponse =
  | PracticeExerciseGetResponse
  | PracticeCompletedGetResponse
  | PracticeStatusResponse;
