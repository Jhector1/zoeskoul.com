/**
 * Provider-neutral contracts for ZoeBuild.
 *
 * Keep vendor SDK types (Cloudflare, Neon, Stripe, Expo, Docker, etc.) out of
 * this package. Product/domain code can depend on these contracts while
 * infrastructure adapters remain replaceable.
 */

export const BUILD_SPEC_VERSION = 1 as const;

export const BUILD_TARGETS = ["web", "ios", "android"] as const;
export type BuildTarget = (typeof BUILD_TARGETS)[number];

export const BUILD_PROJECT_TYPES = [
  "static-site",
  "frontend-app",
  "fullstack-app",
  "mobile-app",
] as const;
export type BuildProjectType = (typeof BUILD_PROJECT_TYPES)[number];

export const BUILD_CAPABILITIES = [
  "backend",
  "database",
  "auth",
  "storage",
  "payments",
  "email",
  "commerce",
] as const;
export type BuildCapability = (typeof BUILD_CAPABILITIES)[number];

export type BuildRequirements = Readonly<{
  backend: boolean;
  database: boolean;
  auth: boolean;
  storage: boolean;
  payments: boolean;
  email: boolean;
  commerce: boolean;
}>;

export type BuildDeploymentPreference =
  | "static"
  | "managed-runtime"
  | "mobile-cloud";

export type ProjectSpecificationV1 = Readonly<{
  version: typeof BUILD_SPEC_VERSION;
  name: string;
  projectType: BuildProjectType;
  targets: readonly BuildTarget[];
  requirements: BuildRequirements;
  pages: readonly string[];
  stackId: string;
  deployment: Readonly<{
    preference: BuildDeploymentPreference;
  }>;
}>;

export type ProjectSpecification = ProjectSpecificationV1;

export type BuildArtifactDefinition = Readonly<{
  type: "static-directory";
  outputPath: string;
}>;

export type BuildStackDefinition = Readonly<{
  id: string;
  projectTypes: readonly BuildProjectType[];
  targets: readonly BuildTarget[];
  runtimeProfileId: string;
  templateId: string;
  commands: Readonly<{
    install?: readonly string[];
    dev?: readonly string[];
    build: readonly string[];
    test?: readonly string[];
  }>;
  preview: Readonly<
    | { type: "static" }
    | { type: "server"; port: number }
  >;
  artifact?: BuildArtifactDefinition;
  supportedCapabilities: readonly BuildCapability[];
  deploymentAdapterId: string;
}>;

export function requiredCapabilities(
  specification: Pick<ProjectSpecification, "requirements">,
): BuildCapability[] {
  return BUILD_CAPABILITIES.filter(
    (capability) => specification.requirements[capability],
  );
}

export function requiresManagedBackend(
  specification: Pick<ProjectSpecification, "requirements">,
): boolean {
  const { requirements } = specification;
  return (
    requirements.backend ||
    requirements.database ||
    requirements.auth ||
    requirements.storage ||
    requirements.payments ||
    requirements.email ||
    requirements.commerce
  );
}

/**
 * Runtime boundary validation for untrusted ZoeBuild project specifications.
 *
 * The TypeScript type protects trusted callers at compile time; this parser
 * protects HTTP/AI/import boundaries at runtime and returns a canonical v1
 * specification with unknown fields discarded.
 */
export const BUILD_SPEC_LIMITS = {
  nameChars: 120,
  stackIdChars: 80,
  pages: 100,
  pageChars: 120,
} as const;

export class BuildSpecificationError extends Error {
  readonly code = "BUILD_SPEC_INVALID" as const;

  constructor(readonly issues: readonly string[]) {
    super(issues.length ? issues.join(" ") : "Invalid ZoeBuild project specification.");
    this.name = "BuildSpecificationError";
  }
}

function asBuildRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedBoundedString(
  value: unknown,
  label: string,
  maxChars: number,
  issues: string[],
): string {
  if (typeof value !== "string") {
    issues.push(`${label} must be a string.`);
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    issues.push(`${label} is required.`);
    return "";
  }
  if (normalized.length > maxChars) {
    issues.push(`${label} must be at most ${maxChars} characters.`);
  }
  return normalized;
}

export function parseProjectSpecification(value: unknown): ProjectSpecification {
  const input = asBuildRecord(value);
  if (!input) {
    throw new BuildSpecificationError(["Project specification must be an object."]);
  }

  const issues: string[] = [];

  if (input.version !== BUILD_SPEC_VERSION) {
    issues.push(`Project specification version must be ${BUILD_SPEC_VERSION}.`);
  }

  const name = normalizedBoundedString(
    input.name,
    "Project name",
    BUILD_SPEC_LIMITS.nameChars,
    issues,
  );

  const projectType =
    typeof input.projectType === "string" &&
    (BUILD_PROJECT_TYPES as readonly string[]).includes(input.projectType)
      ? (input.projectType as BuildProjectType)
      : null;
  if (!projectType) {
    issues.push("Project type is not supported.");
  }

  const targets: BuildTarget[] = [];
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    issues.push("At least one build target is required.");
  } else {
    const seen = new Set<string>();
    for (const rawTarget of input.targets) {
      if (
        typeof rawTarget !== "string" ||
        !(BUILD_TARGETS as readonly string[]).includes(rawTarget)
      ) {
        issues.push("Build target is not supported.");
        continue;
      }
      if (seen.has(rawTarget)) {
        issues.push(`Duplicate build target: ${rawTarget}.`);
        continue;
      }
      seen.add(rawTarget);
      targets.push(rawTarget as BuildTarget);
    }
  }

  const requirementInput = asBuildRecord(input.requirements);
  const requirementValues = {} as Record<BuildCapability, boolean>;
  if (!requirementInput) {
    issues.push("Build requirements must be an object.");
    for (const capability of BUILD_CAPABILITIES) {
      requirementValues[capability] = false;
    }
  } else {
    for (const capability of BUILD_CAPABILITIES) {
      const raw = requirementInput[capability];
      if (typeof raw !== "boolean") {
        issues.push(`Requirement ${capability} must be boolean.`);
        requirementValues[capability] = false;
      } else {
        requirementValues[capability] = raw;
      }
    }
  }

  const pages: string[] = [];
  if (!Array.isArray(input.pages)) {
    issues.push("Pages must be an array.");
  } else {
    if (input.pages.length > BUILD_SPEC_LIMITS.pages) {
      issues.push(`Pages may contain at most ${BUILD_SPEC_LIMITS.pages} entries.`);
    }
    const seenPages = new Set<string>();
    for (const rawPage of input.pages.slice(0, BUILD_SPEC_LIMITS.pages)) {
      const page = normalizedBoundedString(
        rawPage,
        "Page name",
        BUILD_SPEC_LIMITS.pageChars,
        issues,
      );
      if (!page) continue;
      if (seenPages.has(page)) {
        issues.push(`Duplicate page: ${page}.`);
        continue;
      }
      seenPages.add(page);
      pages.push(page);
    }
  }

  const stackId = normalizedBoundedString(
    input.stackId,
    "Stack id",
    BUILD_SPEC_LIMITS.stackIdChars,
    issues,
  );

  const deploymentInput = asBuildRecord(input.deployment);
  const deploymentPreference = deploymentInput?.preference;
  const validDeploymentPreference =
    deploymentPreference === "static" ||
    deploymentPreference === "managed-runtime" ||
    deploymentPreference === "mobile-cloud"
      ? deploymentPreference
      : null;
  if (!validDeploymentPreference) {
    issues.push("Deployment preference is not supported.");
  }

  if (issues.length || !projectType || !validDeploymentPreference) {
    throw new BuildSpecificationError(issues);
  }

  return {
    version: BUILD_SPEC_VERSION,
    name,
    projectType,
    targets,
    requirements: requirementValues,
    pages,
    stackId,
    deployment: {
      preference: validDeploymentPreference,
    },
  };
}
