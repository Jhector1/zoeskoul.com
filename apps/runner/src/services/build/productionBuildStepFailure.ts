/** Stable, sanitized failure signals for isolated production-build steps.
 * Never include container output, source, registry URLs or credentials here.
 */
export type ProductionBuildStep = "install" | "build";
export type ProductionBuildFailureKind = "nonzero-exit" | "timeout";

export class TrustedProductionBuildStepFailure extends Error {
  readonly name = "TrustedProductionBuildStepFailure";
  constructor(
    readonly stage: ProductionBuildStep,
    readonly failure: ProductionBuildFailureKind,
  ) {
    super("Isolated production-build step did not complete successfully.");
  }
}

export function classifyProductionBuildStepFailure(error: unknown): Readonly<{
  status: 422 | 502 | 504;
  code: "BUILD_COMPILATION_REJECTED" | "BUILD_DEPENDENCY_INSTALL_FAILED" | "BUILD_RUNNER_STEP_TIMEOUT";
  message: string;
  stage: ProductionBuildStep;
  failure: ProductionBuildFailureKind;
}> | null {
  if (!(error instanceof TrustedProductionBuildStepFailure)) return null;
  if (error.failure === "timeout") return {
    status: 504, code: "BUILD_RUNNER_STEP_TIMEOUT", stage: error.stage, failure: error.failure,
    message: "Isolated build step timed out; compilation was not confirmed.",
  };
  return error.stage === "build" ? {
    status: 422, code: "BUILD_COMPILATION_REJECTED", stage: error.stage, failure: error.failure,
    message: "The isolated compiler rejected the proposed source.",
  } : {
    status: 502, code: "BUILD_DEPENDENCY_INSTALL_FAILED", stage: error.stage, failure: error.failure,
    message: "The isolated dependency install did not complete.",
  };
}
