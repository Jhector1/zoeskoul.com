import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { createRegisteredProductionBuildJob } from "@zoeskoul/build-preparation";
import {
  applyZoeEditsToWorkspace,
  validateZoeEdits,
  ZoeEditInputError,
} from "./zoeTargetedSourceEdit";
import type {
  verifyTanstackWorkerEditCandidate,
  TanstackCandidateBuildVerification,
} from "./zoeTanstackWorkerCandidate";

type Specification = Parameters<typeof createRegisteredProductionBuildJob>[0]["specification"];
type VerifyInput = Parameters<typeof verifyTanstackWorkerEditCandidate>[0];
type PersistInput = Readonly<{workspace: WorkspaceStateV2; baseVersion: number}>;

export type TanstackReviewedCommitOutcome =
  | Readonly<{kind:"saved"; sourceVersion:number; verification:TanstackCandidateBuildVerification}>
  | Readonly<{kind:"not-verified"; verification:TanstackCandidateBuildVerification}>
  | Readonly<{kind:"not-found"; verification:TanstackCandidateBuildVerification}>;

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Validate the reviewed, browser-submitted edits against the current owner-read
 * source; compile that exact candidate; ONLY THEN invoke the existing owner- and
 * baseVersion-scoped transactional persistence port. No AI call is made here.
 *
 * Persist MUST use an atomic, baseVersion-CAS writer: a successful compilation
 * is not a reservation of the project version. If another edit wins during
 * compilation, that transaction must reject the stale candidate.
 */
export async function commitVerifiedTanstackReviewedEdit(
  input: Readonly<{
    userId:string;
    buildProjectId:string;
    workspace:WorkspaceStateV2;
    edits:unknown;
    specification:Specification;
    sourceVersion:number;
    baseVersion:number;
    verificationId:string;
  }>,
  dependencies: Readonly<{
    verify:(request:VerifyInput)=>Promise<TanstackCandidateBuildVerification>;
    persist:(request:PersistInput)=>Promise<{sourceVersion:number}|null>;
  }>,
):Promise<TanstackReviewedCommitOutcome> {
  if (!Number.isSafeInteger(input.baseVersion) || input.baseVersion < 1 ||
      input.baseVersion !== input.sourceVersion) {
    throw new ZoeEditInputError("BUILD_EDIT_STALE", "A newer source version exists. No source was saved.");
  }
  const validatedEdits = validateZoeEdits(input.workspace, input.edits);
  const candidate = applyZoeEditsToWorkspace(input.workspace, validatedEdits);
  const verification = await dependencies.verify({
    userId:input.userId,
    buildProjectId:input.buildProjectId,
    workspace:input.workspace,
    edits:validatedEdits,
    specification:input.specification,
    sourceVersion:input.sourceVersion,
    verificationId:input.verificationId,
  });
  // A mere "passed" flag (including one from a future incorrectly wired
  // verifier) cannot authorize the write. Require full matching provenance.
  if (verification.state !== "passed" || verification.reason !== "runner-passed" ||
      verification.sourceVersion !== input.sourceVersion ||
      verification.verificationId !== input.verificationId ||
      verification.browser !== "not-run" ||
      !verification.snapshotSha256 || !SHA256_HEX.test(verification.snapshotSha256) ||
      !verification.artifactSha256 || !SHA256_HEX.test(verification.artifactSha256)) {
    // A malformed success-shaped receipt must never surface as a "passed"
    // verification in the HTTP response, even though persistence is blocked.
    return {kind:"not-verified",verification: verification.state === "passed"
      ? {...verification,state:"not-run",reason:"runner-response-mismatch",artifactSha256:null}
      : verification};
  }
  // Only the server-computed candidate is passed to the existing transaction;
  // untrusted verification and source objects are not HTTP inputs to persist.
  const saved = await dependencies.persist({workspace:candidate,baseVersion:input.baseVersion});
  if (!saved) return {kind:"not-found",verification};
  if (!Number.isSafeInteger(saved.sourceVersion) || saved.sourceVersion < input.sourceVersion) {
    throw new Error("Verified source persistence returned an invalid version.");
  }
  return {kind:"saved",sourceVersion:saved.sourceVersion,verification};
}
