import type { RequestHandler } from "express";
import { BuildExecutorContractError, parseTrustedBuildJobRequest } from "@zoeskoul/build-executor-contracts";
import { resolveTrustedBuildOperation } from "../services/build/trustedBuildOperations.js";

/** Internal service-authenticated validation only. No execution in V300I. */
export const validateBuildJobRoute: RequestHandler = async (req, res) => {
  try {
    const request = parseTrustedBuildJobRequest(req.body);
    const plan = resolveTrustedBuildOperation(request);

    return res.status(200).json({
      ok: true,
      validation: {
        protocolVersion: request.protocolVersion,
        operation: request.operation,
        buildProjectId: request.buildProjectId,
        sourceVersion: request.sourceVersion,
        executorProfileId: plan.executorProfileId,
        outputPaths: [...plan.outputPaths],
        fileCount: request.files.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid trusted Build job.";
    return res.status(error instanceof BuildExecutorContractError ? 400 : 409).json({
      ok: false,
      error: message,
    });
  }
};
