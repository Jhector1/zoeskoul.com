import type { RequestHandler } from "express";
import {
  BuildExecutorContractError,
  parseTrustedBuildJobRequest,
} from "@zoeskoul/build-executor-contracts";
import { BuildPreparationError } from "@zoeskoul/build-preparation";

import { executeDependencyLockBootstrap } from "../services/build/executeDependencyLockBootstrap.js";
import {
  withZoeBuildBuildSlot,
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

    const result = await withZoeBuildBuildSlot(() => executeDependencyLockBootstrap(request));
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ZoeBuildBuildCapacityError) {
      return res.status(429).json({
        ok: false,
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
