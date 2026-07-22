import type { Difficulty, TopicSlug } from "@/lib/practice/types";
import type {
  PracticeExperienceMode,
  PracticeExperiencePolicy,
  PracticeViewerTier,
} from "./types";
import {
  DEFAULT_DAILY_PRACTICE_TARGET_COUNT,
  ONBOARDING_TRIAL_TARGET_COUNT,
} from "./defaults";

const FULL_HELP = true;

function positiveWholeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPracticeExperiencePolicy(args: {
  mode: PracticeExperienceMode;
  viewerTier?: PracticeViewerTier;
  difficulty?: Difficulty | null;
  topic?: "all" | TopicSlug | null;
  targetCount?: number | null;
  assignmentAllowReveal?: boolean;
  assignmentQuestionMaxAttempts?: number | null;
}): PracticeExperiencePolicy {
  const viewerTier = args.viewerTier ?? "guest";
  const difficulty = args.difficulty ?? "easy";
  const topic = args.topic ?? "all";

  switch (args.mode) {
    case "assignment":
      return {
        mode: "assignment",
        label: "Assignment",
        targetCount: args.targetCount ?? null,
        maxAttempts: args.assignmentQuestionMaxAttempts ?? 3,
        allowReveal: Boolean(args.assignmentAllowReveal),
        lockDifficulty: difficulty,
        lockTopic: topic,
        filters: {
          topicEditable: false,
          difficultyEditable: false,
          purposeEditable: false,
          countEditable: false,
        },
        eligibility: {
          allowedKinds: null,
          allowedPurposes: ["quiz"],
          allowMultiFile: false,
          allowTerminal: false,
        },
        rewards: {
          learningXp: true,
          rankedXp: false,
          rankedDailyCap: null,
        },
      };

    case "public_challenge":
      return {
        mode: "public_challenge",
        label: "Public challenge",
        targetCount: 1,
        maxAttempts: null,
        allowReveal: FULL_HELP,
        lockDifficulty: difficulty,
        lockTopic: topic,
        filters: {
          topicEditable: false,
          difficultyEditable: false,
          purposeEditable: false,
          countEditable: false,
        },
        eligibility: {
          allowedKinds: null,
          allowedPurposes: ["quiz", "project"],
          allowMultiFile: true,
          allowTerminal: false,
        },
        rewards: {
          learningXp: viewerTier !== "guest",
          rankedXp: false,
          rankedDailyCap: null,
        },
      };

    case "onboarding_trial":
      return {
        mode: "onboarding_trial",
        label: "Onboarding trial",
        targetCount: args.targetCount ?? ONBOARDING_TRIAL_TARGET_COUNT,
        maxAttempts: 3,
        allowReveal: FULL_HELP,
        lockDifficulty: difficulty,
        lockTopic: topic,
        filters: {
          topicEditable: false,
          difficultyEditable: false,
          purposeEditable: false,
          countEditable: false,
        },
        eligibility: {
          allowedKinds: null,
          allowedPurposes: ["quiz"],
          allowMultiFile: false,
          allowTerminal: false,
        },
        rewards: {
          learningXp: false,
          rankedXp: false,
          rankedDailyCap: null,
        },
      };

    case "daily_five": {
      const targetCount = positiveWholeNumber(
        args.targetCount,
        DEFAULT_DAILY_PRACTICE_TARGET_COUNT,
      );
      return {
        mode: "daily_five",
        label: "Daily Practice",
        targetCount,
        maxAttempts: null,
        allowReveal: FULL_HELP,
        lockDifficulty: difficulty,
        lockTopic: topic,
        filters: {
          topicEditable: false,
          difficultyEditable: false,
          purposeEditable: false,
          countEditable: false,
        },
        eligibility: {
          allowedKinds: ["code_input"],
          allowedPurposes: ["project"],
          allowMultiFile: false,
          allowTerminal: false,
        },
        rewards: {
          learningXp: true,
          rankedXp: true,
          rankedDailyCap: targetCount,
        },
      };
    }

    case "standard":
    case "practice":
    default: {
      const editable = viewerTier === "subscriber" || args.mode === "practice";
      return {
        mode: args.mode,
        label: args.mode === "standard" ? "Subscriber practice" : "Practice",
        targetCount: args.targetCount ?? null,
        maxAttempts: null,
        allowReveal: true,
        lockDifficulty: editable ? null : difficulty,
        lockTopic: editable ? null : topic,
        filters: {
          topicEditable: editable,
          difficultyEditable: editable,
          purposeEditable: editable,
          countEditable: editable,
        },
        eligibility: {
          allowedKinds: null,
          allowedPurposes: editable ? ["quiz", "project"] : ["project"],
          allowMultiFile: true,
          allowTerminal: true,
        },
        rewards: {
          learningXp: viewerTier !== "guest",
          rankedXp: false,
          rankedDailyCap: null,
        },
      };
    }
  }
}
