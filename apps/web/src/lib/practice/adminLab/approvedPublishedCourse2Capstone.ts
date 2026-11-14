import "server-only";

import { createHash } from "node:crypto";
import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";
import {
  course2FinalFilesystemExpected,
  hasCompetingAdminLabGradingStrategy,
  matchesCompleteCourse2FinalFilesystemContract,
} from "../api/validate/grade/adminLabFilesystemEvidencePolicy";

/**
 * Explicit, operator-approved fingerprint of an already reviewed and installed
 * compiled topic bundle. Intentionally unset while Course 2 is draft-only.
 * This is NOT a learner grant, an automatically generated approval, or a
 * reference to the developer-only admin-lab-qa answer-key file.
 */
const APPROVED_DIGEST_ENV = "ZOESKOUL_LEARNING_COURSE2_FINAL_APPROVED_TOPIC_SHA256";
const SUBJECT = "linux-files-permissions-users";
const MODULE = "linux-module-4-secure-project-capstone";
const TOPIC = "final-capstone-secure-project";
const EXERCISE = "final-capstone-secure-project-step-5";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function stableJson(value: unknown): string {
  // Compiled topic bundles are JSON data; canonical object-key ordering avoids
  // fingerprints differing because of otherwise equivalent object insertion order.
  const seen = new Set<object>();
  const canonicalize = (item: unknown): unknown => {
    if (!item || typeof item !== "object") return item;
    if (seen.has(item)) throw new Error("Non-JSON curriculum bundle");
    seen.add(item);
    try {
      if (Array.isArray(item)) return item.map(canonicalize);
      const data = item as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(data).sort()) {
        if (data[key] !== undefined) out[key] = canonicalize(data[key]);
      }
      return out;
    } finally { seen.delete(item); }
  };
  const valueJson = JSON.stringify(canonicalize(value));
  if (typeof valueJson !== "string") throw new Error("Invalid curriculum bundle");
  return valueJson;
}

/** Fingerprint the complete installed topic bundle, not browser-supplied data. */
export function course2PublishedTopicDigest(topicBundle: unknown): string {
  return createHash("sha256")
    .update("zoelearning-course2-final-topic/v1\0", "utf8")
    .update(stableJson(topicBundle), "utf8")
    .digest("hex");
}

/** Published contract ingress for the already existing shell_task builder. */
export function resolveApprovedCourse2PrivateExpected(args: {
  topicBundle: unknown;
  manifestExercise: unknown;
  exerciseKey: string;
}): { digest: string; privateExpected: { adminLabFilesystemExpectations: ReturnType<typeof course2FinalFilesystemExpected> } } | null {
  const bundle = record(args.topicBundle);
  if (!bundle || bundle.subjectSlug !== SUBJECT || bundle.moduleSlug !== MODULE ||
      bundle.topicId !== TOPIC || args.exerciseKey !== EXERCISE) return null;
  const exercises = Array.isArray(bundle.exercises) ? bundle.exercises : [];
  const matching = exercises.filter((exercise) => record(exercise)?.id === EXERCISE);
  if (matching.length !== 1 || matching[0] !== args.manifestExercise) return null;
  const def = record(matching[0]);
  const recipe = record(def?.recipe);
  if (!def || def.kind !== "code_input" || def.language !== "bash" ||
      recipe?.type !== "shell_task" || recipe.mode !== "terminal_workspace" ||
      Object.prototype.hasOwnProperty.call(def, "adminLabFilesystemExpectations") ||
      Object.prototype.hasOwnProperty.call(def, "__serverPrivateFilesystemExpected")) return null;
  // Competing command, stdout, or browser-workspace grading strategies cannot
  // authorize a privileged filesystem-only final assessment.
  if (["tests", "terminalExpectations", "workspaceExpectations", "hiddenShellCheck",
       "sourceChecks", "semanticChecks", "solutionCode", "solutionFiles"].some((field) => def[field] != null) ||
      record(def.workspace)?.workspaceExpectations != null) return null;

  const approved = process.env[APPROVED_DIGEST_ENV]?.trim().toLowerCase();
  if (!approved || !/^[0-9a-f]{64}$/.test(approved)) return null;
  const digest = course2PublishedTopicDigest(bundle);
  if (approved !== digest) return null;
  return {
    digest,
    privateExpected: { adminLabFilesystemExpectations: course2FinalFilesystemExpected() },
  };
}

/** Validate a persisted private version against the CURRENT published source. */
export function isCurrentApprovedCourse2FinalInstance(instance: unknown): boolean {
  const row = record(instance);
  const topic = record(row?.topic);
  const subject = record(topic?.subject);
  const module = record(topic?.module);
  const moduleSubject = record(module?.subject);
  const slug = topic?.slug;
  if (row?.exerciseKey !== EXERCISE || subject?.slug !== SUBJECT ||
      module?.slug !== MODULE || moduleSubject?.slug !== SUBJECT ||
      typeof topic?.subjectId !== "string" || moduleSubject?.id !== topic.subjectId ||
      typeof slug !== "string" ||
      (slug !== TOPIC && !slug.endsWith(`.${TOPIC}`))) return false;
  const payload = record(row?.secretPayload);
  const expected = record(payload?.expected);
  if (!expected || hasCompetingAdminLabGradingStrategy(expected) ||
      !matchesCompleteCourse2FinalFilesystemContract(expected.adminLabFilesystemExpectations)) return false;
  try {
    const manifest = resolveTopicBundleManifest({subjectSlug: SUBJECT, topicSlugOrId: TOPIC});
    const exercise = manifest?.exercises?.find((item: {id?: string}) => item.id === EXERCISE);
    if (!exercise) return false;
    const approved = resolveApprovedCourse2PrivateExpected({
      topicBundle: manifest, manifestExercise: exercise, exerciseKey: EXERCISE,
    });
    return Boolean(approved && expected.adminLabPublishedTopicSha256 === approved.digest);
  } catch {
    // A missing, invalid or partially deployed compiled bundle is an
    // infrastructure failure, never a reason to award an old persisted result.
    return false;
  }
}
