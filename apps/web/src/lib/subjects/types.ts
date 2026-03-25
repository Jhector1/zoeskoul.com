







export type ReviewTopicId = string;

export type ReviewTopic = {
    id: ReviewTopicId;
    label: string;
    minutes?: number;
    summary?: string;

    // ✅ allow `as const` topics
    cards: ReadonlyArray<ReviewCard>;
};

export type ReviewCard =
    | { type: "text"; id: string; title?: string; markdown: string; spec?: any }
    | { type: "sketch"; id: string; title?: string; sketchId: string; spec?: any; height?: number; props?: any }
    | { type: "quiz"; id: string; title?: string; passScore?: number; spec: ReviewQuizSpec }
    // ✅ project card in your code has passScore sometimes → allow it
    | { type: "project"; id: string; title?: string; passScore?: number; spec: ReviewProjectSpec }
    | ReviewVideoCard;

export type ReviewModule = {
    id: string;
    title: string;
    subtitle?: string;
    startPracticeHref?: (topicSlug: string) => string;

    // ✅ allow `as const` topic lists
    topics: ReadonlyArray<{
        id: string;
        label: string;
        minutes?: number;
        summary?: string;
        cards: ReadonlyArray<ReviewCard>;
    }>;
};

export type ReviewTopicShape = ReviewModule["topics"][number];












  import type { PracticeKind } from "@prisma/client";

export type ReviewQuizSpec = {
    subject: string;
    module?: string;
    moduleSlug?: string;
    section?: string;
    topic?: string;
    difficulty?: "easy" | "medium" | "hard";
    n?: number;
    allowReveal?: boolean;
    preferKind?: PracticeKind | null;
    maxAttempts?: number;
};

export type ReviewQuestion =
  | {
      kind: "mcq";
      id: string;
      prompt: string;
      choices: { id: string; label: string }[];
      answerId: string;
      explain?: string;
    }
  | {
      kind: "numeric";
      id: string;
      prompt: string;
      answer: number;
      tolerance?: number;
      explain?: string;
    }
  | {
      kind: "practice";
      id: string;
      prompt?: string;
      fetch: {
        subject: string;
        module?: string;
        section?: string;
        topic?: string; // slug
        difficulty?: "easy" | "medium" | "hard";
        allowReveal?: boolean;
        preferKind?: PracticeKind | null;
      };
      maxAttempts?: number;
    };


    export type ReviewVideoProvider = "auto" | "youtube" | "vimeo" | "iframe" | "file";

export type ReviewVideoCard = {
  type: "video";
  id: string;
  title?: string;

  /** Can be hosted anywhere */
  url: string;

  /**
   * auto:
   *  - youtube/vimeo => iframe embed
   *  - .mp4/.webm/.mov => <video>
   *  - otherwise => iframe
   */
  provider?: ReviewVideoProvider;

  /** Optional start time in seconds (works for youtube/vimeo; for <video> we seek on mount best-effort) */
  startSeconds?: number;

  /** Optional poster image for <video> */
  posterUrl?: string;

  /** Optional caption/notes under the video */
  captionMarkdown?: string;
  spec?: any;
};

// then include it in ReviewCard







export type SeedPolicy = "actor" | "global";


export type Difficulty = "easy" | "medium" | "hard";
// export type SeedPolicy = "actor" | "global";

export type ReviewProjectStep = {
    id: string;
    title?: string;

    // ✅ allow inheriting from spec
    topic?: string;
    difficulty?: Difficulty;
    preferKind?: PracticeKind | null;

    exerciseKey?: string;
    seedPolicy?: SeedPolicy;

    maxAttempts?: number;
    carryFromPrev?: boolean;
};

export type ReviewProjectSpec = {
    mode: "project";
    subject: string;
    module?: string;
    moduleSlug?: string;
    section?: string;
    topic?: string;
    difficulty?: Difficulty;
    preferKind?: PracticeKind | null;
    allowReveal?: boolean;
    maxAttempts?: number;
    steps: ReviewProjectStep[];
};
export type PurposeMode = "quiz" | "project" | "mixed";
export type PurposePolicy = "strict" | "fallback";




