import { loadAuthorOnlyAdminQaExercises, loadAuthorOnlyAdminQaExpected } from "./adminLabQaAuthoring";

/** Author-only exercises are kept outside compiled student lessons. */
export async function loadDraftAdminQaExercises(refValue: unknown) {
  return loadAuthorOnlyAdminQaExercises(refValue);
}

/** Re-reads trusted server-authored expectations; never accepts browser targets. */
export async function loadDraftAdminQaExpected(key: unknown) {
  return loadAuthorOnlyAdminQaExpected(key);
}
