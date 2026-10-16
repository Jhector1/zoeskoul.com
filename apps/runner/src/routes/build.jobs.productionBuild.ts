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

import {
  executeProductionBuild,
} from "../services/build/executeProductionBuild.js";

export const executeBuildProductionRoute:
  RequestHandler =
    async (
      req,
      res,
    ) => {
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

        const result =
          await executeProductionBuild(
            request,
          );

        return res
          .status(200)
          .json(
            result,
          );
      } catch (error) {
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
            error,
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
