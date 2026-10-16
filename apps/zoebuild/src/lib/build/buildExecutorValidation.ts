import "server-only";
import type {
  DependencyLockBootstrapExecutionResponseV1,
  DependencyLockBootstrapJobRequestV1,
  ProductionBuildExecutionResponseV1,
  ProductionBuildJobRequestV1,
  TrustedBuildJobRequest,
  TrustedBuildJobValidationResponse,
} from "@zoeskoul/build-executor-contracts";
import { runnerPost } from "@zoeskoul/platform-server/server/runnerClient";

export async function validateTrustedBuildJobAtRunner(args: Readonly<{
  actorKey: string;
  request: TrustedBuildJobRequest;
}>): Promise<TrustedBuildJobValidationResponse> {
  const actorKey = args.actorKey.trim();
  if (!actorKey) throw new Error("ZoeBuild runner actor key is required.");
  return runnerPost<TrustedBuildJobValidationResponse>(
    "/build/jobs/validate",
    actorKey,
    args.request,
  );
}

export async function executeTrustedDependencyLockBootstrapAtRunner(args: Readonly<{
  actorKey: string;
  request: DependencyLockBootstrapJobRequestV1;
}>): Promise<DependencyLockBootstrapExecutionResponseV1> {
  const actorKey = args.actorKey.trim();
  if (!actorKey) {
    throw new Error("ZoeBuild runner actor key is required.");
  }

  return runnerPost<DependencyLockBootstrapExecutionResponseV1>(
    "/build/jobs/dependency-lock-bootstrap",
    actorKey,
    args.request,
  );
}


export async function executeTrustedProductionBuildAtRunner(
  args: Readonly<{
    actorKey: string;
    request:
      ProductionBuildJobRequestV1;
  }>,
): Promise<
  ProductionBuildExecutionResponseV1
> {
  const actorKey =
    args.actorKey.trim();

  if (!actorKey) {
    throw new Error(
      "ZoeBuild runner actor key is required.",
    );
  }

  return runnerPost<
    ProductionBuildExecutionResponseV1
  >(
    "/build/jobs/production-build",
    actorKey,
    args.request,
  );
}
