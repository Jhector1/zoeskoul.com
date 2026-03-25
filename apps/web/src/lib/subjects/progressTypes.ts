// src/lib/review/progressTypes.ts
export type SavedQuizState = {
  answers: Record<string, any>;
  checkedById: Record<string, boolean>;

  // practice questions: store only patches (no keys/secrets)
  practiceItemPatch?: Record<string /*questionId*/, any>;
  practiceMeta?: Record<
    string /*questionId*/,
    { attempts: number; ok: boolean | null }
  >;

  updatedAt?: number;
    excusedById?: Record<string /*questionId*/, boolean>;

};
export type ReviewTopicProgress = {
    quizVersion?: number;
    cardsDone?: Record<string, boolean>;
    quizzesDone?: Record<string, boolean>;
    quizState?: Record<string, SavedQuizState>;

    // ✅ NEW
    sketchState?: Record<string, any>;

    completed?: boolean;
    completedAt?: string;
};

export type ReviewProgressState = {
    quizVersion?: number;
    moduleCompleted?: boolean;
    moduleCompletedAt?: string;
    activeTopicId?: string;
    assignmentSessionId?: string | null;

    topics?: Record<string, ReviewTopicProgress>;
};

// export type ReviewProgressState = {
//   activeTopicId?: string;
//  // ✅ new
//   moduleCompleted?: boolean;
//   moduleCompletedAt?: string;
//   topics?: Record<
//     string /*topicId*/,
//     { quizVersion?: number;
//       cardsDone?: Record<string /*cardId*/, boolean>;
//       quizzesDone?: Record<string /*quizCardId*/, boolean>;
//       quizState?: Record<string /*quizCardId*/, SavedQuizState>;
//       completed?: boolean;
//       completedAt?: string;
//     }
//   >;
//     quizVersion?: number;
// };
