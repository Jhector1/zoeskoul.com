export type LearningSolutionPolicy =
  | "instructor_only"
  | "after_completion"
  | "after_due_date"
  | "always";

export function canViewLearningAssignmentSolutions(args: {
  policy: LearningSolutionPolicy;
  dueAt?: Date | null;
  completed: boolean;
  now?: Date;
}): boolean {
  switch (args.policy) {
    case "always":
      return true;
    case "after_completion":
      return args.completed;
    case "after_due_date":
      return Boolean(args.dueAt && args.dueAt <= (args.now ?? new Date()));
    case "instructor_only":
    default:
      return false;
  }
}
