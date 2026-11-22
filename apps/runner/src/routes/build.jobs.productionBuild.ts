import { ZoebuildPreviewMaintenanceError } from "../services/build/zoebuildPreviewAdmission.js";
import type {
  RequestHandler,
} from "express";

import {
  BuildExecutorContractError,
  parseTrustedBuildJobRequest,
} from "@zoeskoul/build-executor-contracts";

import {
  BuildPreparationError,
} from "@zoeskoul/build-preparation";

import { executeTanstackWorkerBuild } from "../services/build/tanstackWorkerBuild.js";
import { assertTanstackWorkerBuildRequest } from "../services/build/tanstackWorkerBuildPolicy.js";
import { referenceOperatorAllowed, shouldRunReferenceWorkerSmoke, WORKER_REFERENCE_PROJECT, generalWorkerVerificationEnabled } from "../services/build/tanstackWorkerRuntimePolicy.js";

import { classifyProductionBuildStepFailure, TrustedProductionBuildStepFailure } from "../services/build/productionBuildStepFailure.js";

import {
  withZoeBuildBuildSlot,
  ZoeBuildBuildCapacityError,
} from "../services/build/zoeBuildBuildCapacity.js";

export const executeBuildProductionRoute:
  RequestHandler =
    async (
      req,
      res,
    ) => {
      let candidatePaths: ReadonlySet<string> = new Set();
      try {
        const request =
          parseTrustedBuildJobRequest(
            req.body,
          );

        if (
          request.operation !==
          "production-build"
        ) {
          return res
            .status(409)
            .json({
              ok: false,

              error:
                "Trusted Build operation is not executable by this route.",
            });
        }

        // Reject old static/React and malformed Worker sources before admission.
        // This service route is authenticated globally in app.ts; the ZoeBuild
        // control plane must independently check the owner and source version.
        assertTanstackWorkerBuildRequest(request);
        const reference = request.buildProjectId === WORKER_REFERENCE_PROJECT;
        if (reference && (!referenceOperatorAllowed(req.header("x-actor-key"), req.socket.remoteAddress,
          Object.keys(req.headers).some(key => key === "forwarded" || key.startsWith("x-forwarded-") || key === "x-real-ip")) ||
          !shouldRunReferenceWorkerSmoke(request))) {
          return res.status(403).json({ok:false,error:"Forbidden."});
        }
        const general = !reference && generalWorkerVerificationEnabled();
        if (general && !/^u:[a-f0-9]{64}$/.test(req.header("x-actor-key") ?? "")) {
          return res.status(403).json({ok:false,error:"Forbidden."});
        }
        candidatePaths = new Set(request.files.map(file => file.path));
        const result = await withZoeBuildBuildSlot(
          () => reference ? executeTanstackWorkerBuild(request, true) : general ? executeTanstackWorkerBuild(request, false, true) : executeTanstackWorkerBuild(request),
        );

        return res
          .status(200)
          .json({ ok: true, result });
      } catch (error) {
        if (error instanceof ZoebuildPreviewMaintenanceError) {
          res.setHeader("Retry-After", "30");
          return res.status(503).json({ok:false,code:"PREVIEW_MAINTENANCE"});
        }
        if (error instanceof ZoeBuildBuildCapacityError) {
          return res.status(429).json({
            ok: false,
            error: error.message,
          });
        }

        const stepFailure = classifyProductionBuildStepFailure(error);
        if (stepFailure) {
          // Only bounded classification fields. Never log container stderr,
          // source, URLs or thrown exception details.
          console.warn("[build/jobs/production-build] isolated step rejected", {
            stage: stepFailure.stage, kind: stepFailure.failure, code: stepFailure.code,
          });
          const report = error instanceof TrustedProductionBuildStepFailure ? error.diagnostics : undefined;
          const buildDiagnostic = report && report.stage === stepFailure.stage ? {
            stage: report.stage, category: report.category, exitCode: report.exitCode,
            oomKilled: report.oomKilled, timedOut: report.timedOut, logProbe: report.logProbe,
            errorCode: report.errorCode,
            compilerDiagnostics: (report.compilerDiagnostics ?? []).filter(item =>
              item.path === null || candidatePaths.has(item.path)),
          } : undefined;
          return res.status(stepFailure.status).json({
            ok: false, code: stepFailure.code, error: stepFailure.message,
            ...(buildDiagnostic ? {buildDiagnostic} : {}),
          });
        }

        const message =
          error instanceof Error
            ? error.message
            : "Trusted production build failed.";

        if (
          error instanceof
          BuildExecutorContractError
        ) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                message,
            });
        }

        if (
          error instanceof
          BuildPreparationError
        ) {
          return res
            .status(409)
            .json({
              ok: false,
              error:
                message,
            });
        }

        console.error(
          "[build/jobs/production-build] failed",
          {
            kind: error instanceof Error ? error.name : "unknown",
          },
        );

        return res
          .status(500)
          .json({
            ok: false,

            error:
              "Trusted production build failed.",
          });
      }
    };
