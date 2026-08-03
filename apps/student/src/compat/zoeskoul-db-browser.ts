/* Generated browser-safe Prisma enum facade. */

export const TutoringInviteEmailStatus = {
  NOT_SENT: "NOT_SENT",
  SENT: "SENT",
  FAILED: "FAILED",
} as const;
export type TutoringInviteEmailStatus = (typeof TutoringInviteEmailStatus)[keyof typeof TutoringInviteEmailStatus];

export const SubjectVisibility = {
  public: "public",
  private: "private",
  organization: "organization",
} as const;
export type SubjectVisibility = (typeof SubjectVisibility)[keyof typeof SubjectVisibility];

export const LearningAssignmentStatus = {
  draft: "draft",
  assigned: "assigned",
  closed: "closed",
} as const;
export type LearningAssignmentStatus = (typeof LearningAssignmentStatus)[keyof typeof LearningAssignmentStatus];

export const LearningSolutionVisibility = {
  instructor_only: "instructor_only",
  after_completion: "after_completion",
  after_due_date: "after_due_date",
  always: "always",
} as const;
export type LearningSolutionVisibility = (typeof LearningSolutionVisibility)[keyof typeof LearningSolutionVisibility];

export const TutoringSessionStatus = {
  draft: "draft",
  live: "live",
  shared: "shared",
  archived: "archived",
} as const;
export type TutoringSessionStatus = (typeof TutoringSessionStatus)[keyof typeof TutoringSessionStatus];

export const TutoringSelectionScope = {
  course: "course",
  module: "module",
  section: "section",
  topic: "topic",
} as const;
export type TutoringSelectionScope = (typeof TutoringSelectionScope)[keyof typeof TutoringSelectionScope];

export const TutoringParticipantRole = {
  learner: "learner",
  observer: "observer",
} as const;
export type TutoringParticipantRole = (typeof TutoringParticipantRole)[keyof typeof TutoringParticipantRole];

export const LearningGroupMemberRole = {
  student: "student",
  instructor: "instructor",
} as const;
export type LearningGroupMemberRole = (typeof LearningGroupMemberRole)[keyof typeof LearningGroupMemberRole];

export const UserRole = {
  student: "student",
  teacher: "teacher",
  admin: "admin",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const PracticePurpose = {
  quiz: "quiz",
  project: "project",
} as const;
export type PracticePurpose = (typeof PracticePurpose)[keyof typeof PracticePurpose];

export const AccessPolicy = {
  free: "free",
  paid: "paid",
} as const;
export type AccessPolicy = (typeof AccessPolicy)[keyof typeof AccessPolicy];

export const SubjectStatus = {
  active: "active",
  coming_soon: "coming_soon",
  disabled: "disabled",
} as const;
export type SubjectStatus = (typeof SubjectStatus)[keyof typeof SubjectStatus];

export const AccessOverride = {
  inherit: "inherit",
  free: "free",
  paid: "paid",
} as const;
export type AccessOverride = (typeof AccessOverride)[keyof typeof AccessOverride];

export const PracticeRunPresetKey = {
  MODULE_QUIZ_ONLY: "MODULE_QUIZ_ONLY",
  MIXED_PRACTICE: "MIXED_PRACTICE",
} as const;
export type PracticeRunPresetKey = (typeof PracticeRunPresetKey)[keyof typeof PracticeRunPresetKey];

export const FeatureKey = {
  ide_multi_file: "ide_multi_file",
  ide_save_cloud: "ide_save_cloud",
  ide_project_create: "ide_project_create",
  ide_project_revisions: "ide_project_revisions",
  ide_project_scope_module: "ide_project_scope_module",
  ide_project_scope_assignment: "ide_project_scope_assignment",
  ide_project_share: "ide_project_share",
  ide_project_unlimited: "ide_project_unlimited",
} as const;
export type FeatureKey = (typeof FeatureKey)[keyof typeof FeatureKey];

export const CodeProjectScopeKind = {
  personal: "personal",
  module: "module",
  assignment: "assignment",
  template: "template",
} as const;
export type CodeProjectScopeKind = (typeof CodeProjectScopeKind)[keyof typeof CodeProjectScopeKind];

export const CodeProjectVisibility = {
  private: "private",
  unlisted: "unlisted",
  shared: "shared",
} as const;
export type CodeProjectVisibility = (typeof CodeProjectVisibility)[keyof typeof CodeProjectVisibility];

export const CodeProjectRole = {
  owner: "owner",
  editor: "editor",
  viewer: "viewer",
} as const;
export type CodeProjectRole = (typeof CodeProjectRole)[keyof typeof CodeProjectRole];

export const PracticeKind = {
  single_choice: "single_choice",
  multi_choice: "multi_choice",
  numeric: "numeric",
  vector_drag_target: "vector_drag_target",
  vector_drag_dot: "vector_drag_dot",
  matrix_input: "matrix_input",
  code_input: "code_input",
  text_input: "text_input",
  drag_reorder: "drag_reorder",
  voice_input: "voice_input",
  word_bank_arrange: "word_bank_arrange",
  listen_build: "listen_build",
  fill_blank_choice: "fill_blank_choice",
} as const;
export type PracticeKind = (typeof PracticeKind)[keyof typeof PracticeKind];

export const PracticeDifficulty = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
} as const;
export type PracticeDifficulty = (typeof PracticeDifficulty)[keyof typeof PracticeDifficulty];

export const PracticeSessionStatus = {
  active: "active",
  completed: "completed",
} as const;
export type PracticeSessionStatus = (typeof PracticeSessionStatus)[keyof typeof PracticeSessionStatus];

export const AssignmentStatus = {
  draft: "draft",
  published: "published",
  archived: "archived",
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export const PracticeSessionMode = {
  standard: "standard",
  daily_five: "daily_five",
  onboarding_trial: "onboarding_trial",
  public_challenge: "public_challenge",
  assignment: "assignment",
} as const;
export type PracticeSessionMode = (typeof PracticeSessionMode)[keyof typeof PracticeSessionMode];

export const StripeSubscriptionStatus = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "unpaid",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "incomplete_expired",
  paused: "paused",
} as const;
export type StripeSubscriptionStatus = (typeof StripeSubscriptionStatus)[keyof typeof StripeSubscriptionStatus];

export const ToolDocFormat = {
  markdown: "markdown",
  plain: "plain",
} as const;
export type ToolDocFormat = (typeof ToolDocFormat)[keyof typeof ToolDocFormat];

export const EnrollmentStatus = {
  enrolled: "enrolled",
  completed: "completed",
  archived: "archived",
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const EnrollmentSource = {
  self: "self",
  assignment: "assignment",
  admin: "admin",
  import: "import",
} as const;
export type EnrollmentSource = (typeof EnrollmentSource)[keyof typeof EnrollmentSource];

export const AccessGrantType = {
  subscription: "subscription",
  purchase: "purchase",
  assignment: "assignment",
  admin: "admin",
  trial: "trial",
} as const;
export type AccessGrantType = (typeof AccessGrantType)[keyof typeof AccessGrantType];

export const XpSourceType = {
  answer_correct: "answer_correct",
  answer_retry_correct: "answer_retry_correct",
  session_complete: "session_complete",
  topic_complete: "topic_complete",
  module_complete: "module_complete",
  streak_bonus: "streak_bonus",
  daily_goal: "daily_goal",
  daily_five_complete: "daily_five_complete",
  public_challenge_complete: "public_challenge_complete",
  assignment_complete: "assignment_complete",
  project_step: "project_step",
} as const;
export type XpSourceType = (typeof XpSourceType)[keyof typeof XpSourceType];
