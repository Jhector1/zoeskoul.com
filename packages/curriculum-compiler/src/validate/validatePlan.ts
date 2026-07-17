import type { CoursePlan, PlannedTopic } from "@zoeskoul/curriculum-contracts";

export type ValidatePlanOptions = {
  requireFinalCapstone?: boolean;
};

function assertPositiveInteger(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }
}

function validateCapstoneTopic(topic: PlannedTopic, path: string) {
  const brief = topic.projectBrief;
  if (!brief) {
    throw new Error(`${path}.projectBrief is required for the final capstone topic`);
  }

  assertPositiveInteger(
    brief.stepCountTarget,
    `${path}.projectBrief.stepCountTarget`,
  );

  if (brief.stepLadder != null) {
    if (!Array.isArray(brief.stepLadder) || brief.stepLadder.length === 0) {
      throw new Error(
        `${path}.projectBrief.stepLadder must be a non-empty array when provided`,
      );
    }

    if (brief.stepLadder.length !== brief.stepCountTarget) {
      throw new Error(
        `${path}.projectBrief.stepLadder must contain exactly ${brief.stepCountTarget} step(s) to match stepCountTarget`,
      );
    }

    brief.stepLadder.forEach((step, index) => {
      const stepPath = `${path}.projectBrief.stepLadder[${index}]`;
      if (!step || typeof step !== "object") {
        throw new Error(`${stepPath} must be an object`);
      }
      if (step.step !== index + 1) {
        throw new Error(`${stepPath}.step must equal ${index + 1}`);
      }
    });
  }
}

export function validatePlan(
  plan: CoursePlan,
  options: ValidatePlanOptions = {},
) {
  if (!Array.isArray(plan.modules) || plan.modules.length === 0) {
    throw new Error("Plan must contain at least one module");
  }

  const requireFinalCapstone = options.requireFinalCapstone !== false;
  const capstoneModules = plan.modules
    .map((module, moduleIndex) => ({ module, moduleIndex }))
    .filter(
      ({ module }) =>
        module.role === "capstone" ||
        module.sections?.some((section) => section.role === "capstone"),
    );

  if (requireFinalCapstone && capstoneModules.length !== 1) {
    throw new Error(
      `Plan must contain exactly one final capstone module, but found ${capstoneModules.length}`,
    );
  }

  if (capstoneModules.length > 1) {
    throw new Error(
      `Plan must contain at most one capstone module, but found ${capstoneModules.length}`,
    );
  }

  if (capstoneModules.length === 0) {
    return;
  }

  const { module: capstoneModule, moduleIndex } = capstoneModules[0];
  if (moduleIndex !== plan.modules.length - 1) {
    throw new Error("The capstone module must be the final module in the plan");
  }

  if (capstoneModule.role !== "capstone") {
    throw new Error('The final capstone module must use role="capstone"');
  }

  if (!Array.isArray(capstoneModule.sections) || capstoneModule.sections.length !== 1) {
    throw new Error(
      "The final capstone module must contain exactly one capstone section",
    );
  }

  const capstoneSection = capstoneModule.sections[0];
  if (capstoneSection.role !== "capstone") {
    throw new Error('The final capstone section must use role="capstone"');
  }

  if (!Array.isArray(capstoneSection.topics) || capstoneSection.topics.length !== 1) {
    throw new Error(
      "The final capstone section must contain exactly one capstone topic",
    );
  }

  validateCapstoneTopic(
    capstoneSection.topics[0],
    `modules[${moduleIndex}].sections[0].topics[0]`,
  );
}
