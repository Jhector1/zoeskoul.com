import type { DraftRef } from "./fs";
import { parseStudentAdminLabTarget, STUDENT_ADMIN_COURSE_SLUG, type StudentAdminLabTarget } from "@/lib/learning/server/learningAdminStudentPolicy";
import { loadSourceTopic, type LoadedSourceTopic } from "./sourceFs";

/** In addition to existing editor+admin auth: separate local-only privileged QA opt-in. */
export function isDraftAdminLabQaEnabled(): boolean {
  return process.env.NODE_ENV !== "production" &&
    process.env.DEV_CURRICULUM_EDITOR === "1" &&
    process.env.DEV_CURRICULUM_ADMIN_LAB_QA_ENABLED === "1";
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = Object.getPrototypeOf(value);
  return p === Object.prototype || p === null;
}

export function parseDraftAdminLabRef(value: unknown): DraftRef | null {
  if (!plainObject(value)) return null;
  const keys = Object.keys(value).sort();
  const required = ["catalog", "module", "subject", "topic"];
  const withLocale = ["catalog", "locale", "module", "subject", "topic"];
  if (JSON.stringify(keys) !== JSON.stringify(required) &&
      JSON.stringify(keys) !== JSON.stringify(withLocale)) return null;
  if (value.catalog !== "linux" || value.subject !== "linux" ||
      (value.locale !== undefined && value.locale !== "en") ||
      typeof value.module !== "string" || typeof value.topic !== "string") return null;
  if (!parseStudentAdminLabTarget({moduleSlug: value.module, topicSlug: value.topic})) return null;
  return {
    catalog: "linux", subject: "linux", module: value.module,
    topic: value.topic, locale: "en",
  };
}

export async function loadApprovedDraftAdminLab(value: unknown): Promise<{
  ref: DraftRef;
  target: StudentAdminLabTarget;
  loaded: LoadedSourceTopic;
}> {
  const ref = parseDraftAdminLabRef(value);
  if (!ref) throw new Error("Invalid approved Course 2 draft topic.");
  const loaded = await loadSourceTopic(ref); // canonical .curriculum-drafts source, compiled in memory
  const target = parseStudentAdminLabTarget({moduleSlug: loaded.moduleDir, topicSlug: loaded.topicDir});
  if (!target || loaded.course !== STUDENT_ADMIN_COURSE_SLUG ||
      loaded.catalog !== "linux" || loaded.subject !== "linux" ||
      loaded.moduleDir !== ref.module || loaded.topicDir !== ref.topic) {
    throw new Error("Requested topic does not match the canonical Course 2 draft.");
  }
  return {ref, target, loaded};
}

/** Reject competing graders. All privileged mode/ownership proof comes from the Runner. */
export function hasOnlyAdminFilesystemStrategy(expected: unknown): boolean {
  if (!plainObject(expected) || !Object.prototype.hasOwnProperty.call(expected, "adminLabFilesystemExpectations")) return false;
  for (const key of ["workspaceExpectations", "terminalExpectations", "hiddenShellCheck", "sourceChecks", "semanticChecks"]) {
    if (expected[key] != null) return false;
  }
  const tests = expected.tests;
  if (tests != null && !Array.isArray(tests)) return false;
  if (Array.isArray(tests) && tests.some((test) =>
    plainObject(test) && ((typeof test.stdout === "string" && test.stdout.trim() !== "") ||
      (typeof test.stdin === "string" && test.stdin.trim() !== "")))) return false;
  return true;
}
