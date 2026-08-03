export const TUTORING_SESSION_HEADER = "x-zoeskoul-tutoring-session-id";
export const TUTORING_WORKSPACE_VIEW_HEADER =
  "x-zoeskoul-tutoring-workspace-view";
export const TUTORING_LEARNER_ID_HEADER =
  "x-zoeskoul-tutoring-learner-id";

/** Workspace identity safe to share between client request context and server access resolution. */
export type TutoringWorkspaceView = "master" | "reference" | "mine" | "learner";
