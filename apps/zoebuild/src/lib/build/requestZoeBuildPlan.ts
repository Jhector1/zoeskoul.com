import type {
  PlanBuildProjectFromPromptResult,
} from "@zoeskoul/build-ai";

import type {
  ZoeBuildPromptSubmission,
} from "@/components/builder/ZoeBuildPromptComposer";

type BuildPlanApiSuccess = Readonly<{
  ok: true;
  plan: PlanBuildProjectFromPromptResult;
  requestId: string;
}>;

type BuildPlanApiFailure = Readonly<{
  ok: false;
  code?: string;
  message?: string;
  requestId?: string;
}>;

export class ZoeBuildPlanRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ZoeBuildPlanRequestError";
  }
}

export async function requestZoeBuildPlan(
  submission: ZoeBuildPromptSubmission,
): Promise<PlanBuildProjectFromPromptResult> {
  const form = new FormData();
  form.set("prompt", submission.prompt);

  for (const file of submission.files) {
    form.append("media", file, file.name);
  }

  const response = await fetch("/api/build/plan", {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });

  let payload: BuildPlanApiSuccess | BuildPlanApiFailure;

  try {
    payload = await response.json();
  } catch {
    throw new ZoeBuildPlanRequestError(
      "BUILD_AI_RESPONSE_INVALID",
      "Zoé returned an invalid planning response.",
    );
  }

  if (!response.ok || !payload.ok) {
    throw new ZoeBuildPlanRequestError(
      payload.ok
        ? "BUILD_AI_PLAN_FAILED"
        : payload.code ?? "BUILD_AI_PLAN_FAILED",
      payload.ok
        ? "Zoé could not create a plan."
        : payload.message ?? "Zoé could not create a plan.",
    );
  }

  return payload.plan;
}

export function formatZoeBuildPlan(
  result: PlanBuildProjectFromPromptResult,
  note = "Nothing has been persisted yet.",
) {
  const pages = result.specification.pages
    .slice(0, 5)
    .join(", ");

  return [
    `Plan ready: ${result.specification.name}`,
    `Stack: ${result.specification.stackId}`,
    pages ? `Pages: ${pages}` : null,
    `AI: ${result.metadata.provider} / ${result.metadata.model}`,
    note,
  ]
    .filter(Boolean)
    .join("\n");
}
