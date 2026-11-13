import "server-only";
import { AdminLabFilesystemExpectedSchema } from "@zoeskoul/code-contracts";
import { authorizeStudentAdminLab } from "@/lib/learning/server/authorizeStudentAdminLab";
import { parseStudentAdminLabTarget, STUDENT_ADMIN_COURSE_SLUG } from "@/lib/learning/server/learningAdminStudentPolicy";
import { runnerPost } from "@/lib/server/runnerClient";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { actorKeyOf, type Actor } from "@/lib/practice/actor";
import type { LoadedValidateInstance } from "../repositories/instance.repo";
import type { SubmitAnswer } from "../schemas";
import type { GradeResult } from "./index";
import { createRunnerUnavailableGradeResult } from "./infrastructureFailure";
import { matchesCompleteCourse2FinalFilesystemContract, requiresCourse2FinalCapstoneFilesystemEvidence } from "./adminLabFilesystemEvidencePolicy";

/** Adapter into the EXISTING grading/attempts pipeline; not a second grader. */
export async function verifyAdminLabFilesystemForPractice(args: {
  instance: LoadedValidateInstance;
  actor: Actor;
  request: Request;
  answer: SubmitAnswer | null;
  persistedExpected: unknown;
  effectiveExpected: unknown;
}): Promise<GradeResult> {
  const unavailable = () => createRunnerUnavailableGradeResult("Administrative lab evidence unavailable");
  const persisted = args.persistedExpected as Record<string, unknown> | null;
  const effective = args.effectiveExpected as Record<string, unknown> | null;
  const persistedRaw = persisted?.adminLabFilesystemExpectations;
  const effectiveRaw = effective?.adminLabFilesystemExpectations;
  // Both the persisted private contract and resolved contract must agree.
  if (JSON.stringify(persistedRaw) !== JSON.stringify(effectiveRaw)) return unavailable();
  const parsed = AdminLabFilesystemExpectedSchema.safeParse(effectiveRaw);
  // Do not silently ignore any second authored grading strategy. A privileged
  // filesystem-only task has one authoritative evidence source.
  const incompatible = ["workspaceExpectations", "terminalExpectations", "hiddenShellCheck", "sourceChecks", "semanticChecks"]
    .some((field) => effective && effective[field] !== undefined && effective[field] !== null) ||
    (Array.isArray(effective?.tests) && effective.tests.some((test: unknown) =>
      test && typeof test === "object" &&
      (typeof (test as {stdout?: unknown}).stdout === "string" && Boolean((test as {stdout: string}).stdout.trim()) ||
       typeof (test as {stdin?: unknown}).stdin === "string" && Boolean((test as {stdin: string}).stdin.trim()))));
  if (!parsed.success || incompatible || args.instance.kind !== "code_input" ||
      args.answer?.kind !== "code_input") return unavailable();
  // Final Course 2 assessment must always cover ALL seven exact paths. The
  // presence of any schema-valid one-path contract must never award a capstone.
  // This also protects previously persisted instances created before GET guards.
  if (requiresCourse2FinalCapstoneFilesystemEvidence(args.instance) &&
      !matchesCompleteCourse2FinalFilesystemContract(effectiveRaw)) return unavailable();
  const topic = args.instance.topic;
  const target = parseStudentAdminLabTarget({
    topicSlug: topic?.slug,
    moduleSlug: topic?.module?.slug,
  });
  if (!args.actor.userId || !target || topic?.subject?.slug !== STUDENT_ADMIN_COURSE_SLUG ||
      topic?.module?.subject?.slug !== STUDENT_ADMIN_COURSE_SLUG ||
      topic?.subjectId !== topic?.module?.subject?.id) return unavailable();

  try {
    // Reuse EXACTLY the admission-time enrollment, publication and practice checks.
    if (!await authorizeStudentAdminLab({actor: args.actor, request: args.request, target})) return unavailable();
    const actorKey = await requireRunnerActorKey();
    if (!/^u:[0-9a-f]{64}$/.test(actorKey)) return unavailable();
    // Match the enrolled practice actor before consulting privileged evidence.
    if (actorKeyOf(args.actor) !== actorKey) return unavailable();
    const result = await runnerPost<{
      ok: boolean;
      passed: boolean;
      failedPaths: string[];
    }>("/sessions/admin/verify-filesystem", actorKey, {
      topicSlug: target.topicSlug,
      expected: parsed.data,
    });
    if (!result || result.ok !== true || typeof result.passed !== "boolean" ||
        !Array.isArray(result.failedPaths) ||
        result.failedPaths.some((entry) => typeof entry !== "string")) return unavailable();
    return {
      ok: result.passed,
      explanation: result.passed
        ? "Verified filesystem permissions and ownership in your lab."
        : "The required filesystem state was not found in your administrator lab.",
      feedback: null,
    };
  } catch {
    // Do not consume attempts or grant credit if Runner, enrollment or the
    // sandbox is unavailable. Existing handler handles this infrastructure result.
    return unavailable();
  }
}
