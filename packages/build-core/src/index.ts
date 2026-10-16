import {
  requiredCapabilities,
  type BuildCapability,
  type BuildProjectType,
  type BuildRequirements,
  type BuildStackDefinition,
  type BuildTarget,
  type ProjectSpecification,
} from "@zoeskoul/build-contracts";

/**
 * Pure ZoeBuild domain rules.
 *
 * This package must stay independent from provider SDKs, persistence,
 * frameworks, HTTP, queues, and AI models. It answers domain questions such
 * as "can this supported stack satisfy this project specification?".
 */

export const STACK_COMPATIBILITY_ISSUE_CODES = [
  "stack-id-mismatch",
  "project-type-unsupported",
  "target-unsupported",
  "capability-unsupported",
] as const;

export type StackCompatibilityIssueCode =
  (typeof STACK_COMPATIBILITY_ISSUE_CODES)[number];

export type StackCompatibilityIssue = Readonly<{
  code: StackCompatibilityIssueCode;
  message: string;
  value: string;
}>;

export type StackCompatibilityResult = Readonly<{
  compatible: boolean;
  issues: readonly StackCompatibilityIssue[];
}>;

export type StackSelectionRequest = Readonly<{
  projectType: BuildProjectType;
  targets: readonly BuildTarget[];
  requirements: BuildRequirements;
}>;

function unique<T>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

export function evaluateStackCompatibility(
  request: StackSelectionRequest,
  stack: BuildStackDefinition,
): StackCompatibilityResult {
  const issues: StackCompatibilityIssue[] = [];

  if (!stack.projectTypes.includes(request.projectType)) {
    issues.push({
      code: "project-type-unsupported",
      message: `Stack ${stack.id} does not support project type ${request.projectType}.`,
      value: request.projectType,
    });
  }

  for (const target of unique(request.targets)) {
    if (!stack.targets.includes(target)) {
      issues.push({
        code: "target-unsupported",
        message: `Stack ${stack.id} does not support target ${target}.`,
        value: target,
      });
    }
  }

  for (const capability of requiredCapabilities(request)) {
    if (!stack.supportedCapabilities.includes(capability)) {
      issues.push({
        code: "capability-unsupported",
        message: `Stack ${stack.id} does not support capability ${capability}.`,
        value: capability,
      });
    }
  }

  return {
    compatible: issues.length === 0,
    issues,
  };
}

export function evaluateProjectStack(
  specification: ProjectSpecification,
  stack: BuildStackDefinition,
): StackCompatibilityResult {
  if (specification.stackId !== stack.id) {
    return {
      compatible: false,
      issues: [
        {
          code: "stack-id-mismatch",
          message: `Specification selects ${specification.stackId}, not ${stack.id}.`,
          value: specification.stackId,
        },
      ],
    };
  }

  return evaluateStackCompatibility(specification, stack);
}

/**
 * Deterministic, fail-closed stack selection.
 *
 * Registry ordering is an explicit product policy. This function never
 * invents a stack and never falls back to an incompatible stack. A future AI
 * planner may rank compatible stacks, but it must still pass this domain gate.
 */
export function selectFirstCompatibleStack(
  request: StackSelectionRequest,
  stacks: readonly BuildStackDefinition[],
): BuildStackDefinition | null {
  for (const stack of stacks) {
    if (evaluateStackCompatibility(request, stack).compatible) {
      return stack;
    }
  }

  return null;
}

export function unsupportedCapabilities(
  request: Pick<StackSelectionRequest, "requirements">,
  stack: BuildStackDefinition,
): BuildCapability[] {
  return requiredCapabilities(request).filter(
    (capability) => !stack.supportedCapabilities.includes(capability),
  );
}
