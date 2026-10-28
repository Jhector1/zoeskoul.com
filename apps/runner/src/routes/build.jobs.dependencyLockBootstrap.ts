import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import {
  BuildExecutorContractError,
  parseTrustedBuildJobRequest,
} from "@zoeskoul/build-executor-contracts";
import { BuildPreparationError } from "@zoeskoul/build-preparation";

import { executeDependencyLockBootstrap } from "../services/build/executeDependencyLockBootstrap.js";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import {
  withZoeBuildQueuedBootstrapSlot,
  zoeBuildBootstrapQueueSnapshot,
  ZoeBuildBuildCapacityError,
} from "../services/build/zoeBuildBuildCapacity.js";

export const executeBuildDependencyLockBootstrapRoute: RequestHandler = async (
  req,
  res,
) => {
  try {
    const request = parseTrustedBuildJobRequest(req.body);

    if (request.operation !== "dependency-lock-bootstrap") {
      return res.status(409).json({
        ok: false,
        error: "Trusted Build operation is not executable by this route.",
      });
    }

    // Actor + the complete validated job define the in-flight identity. Never
    // coalesce different owners, source revisions, or dependency manifests.
    const actorKey = getRequiredActorKey(req);
    const requestKey = createHash("sha256")
      .update(actorKey).update("\0").update(JSON.stringify(request))
      .digest("hex");
    const startedAt = Date.now();
    const result = await withZoeBuildQueuedBootstrapSlot(
      requestKey, () => executeDependencyLockBootstrap(request),
    );
    console.info("[build/jobs/dependency-lock-bootstrap] completed", {
      durationMs: Date.now() - startedAt,
    });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ZoeBuildBuildCapacityError) {
      const admission = zoeBuildBootstrapQueueSnapshot();
      console.warn("[build/jobs/dependency-lock-bootstrap] queue capacity reached", {
        waiting: admission.waiting,
        activeMs: admission.activeMs,
      });
      res.setHeader("Retry-After", "30");
      return res.status(429).json({
        ok: false,
        code: "ZOEBUILD_BUILD_CAPACITY_EXHAUSTED",
        error: error.message,
      });
    }

    const message =
      error instanceof Error
        ? error.message
        : "Trusted Build dependency bootstrap failed.";

    if (error instanceof BuildExecutorContractError) {
      return res.status(400).json({ ok: false, error: message });
    }

    if (error instanceof BuildPreparationError) {
      return res.status(409).json({ ok: false, error: message });
    }

    console.error("[build/jobs/dependency-lock-bootstrap] failed", {
      error,
    });

    return res.status(500).json({
      ok: false,
      error: "Trusted Build dependency bootstrap failed.",
    });
  }
};
