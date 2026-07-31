export type LearningAssignmentWindow = {
  status: "draft" | "assigned" | "closed";
  availableFrom?: Date | null;
  dueAt?: Date | null;
};

export function isLearningAssignmentOpen(
  assignment: LearningAssignmentWindow,
  now = new Date(),
): boolean {
  if (assignment.status !== "assigned") return false;
  if (assignment.availableFrom && assignment.availableFrom > now) return false;
  return true;
}

export function learningAssignmentAvailability(
  assignment: LearningAssignmentWindow,
  now = new Date(),
): "draft" | "upcoming" | "open" | "past_due" | "closed" {
  if (assignment.status === "draft") return "draft";
  if (assignment.status === "closed") return "closed";
  if (assignment.availableFrom && assignment.availableFrom > now) return "upcoming";
  if (assignment.dueAt && assignment.dueAt < now) return "past_due";
  return "open";
}
