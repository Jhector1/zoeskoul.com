import {
  BuildPreparationError,
} from "@zoeskoul/build-preparation";

const error = new BuildPreparationError(
  "BUILD_PREPARATION_INVALID",
  "runner runtime smoke",
);

if (
  error.code !== "BUILD_PREPARATION_INVALID" ||
  error.message !== "runner runtime smoke"
) {
  throw new Error(
    "Runner workspace TypeScript runtime smoke failed.",
  );
}

console.log("runner_workspace_typescript_runtime=PASS");
