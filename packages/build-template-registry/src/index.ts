import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";
import { TANSTACK_START_TEMPLATE_V1 } from "./tanstackStartTemplate";
export { TANSTACK_START_TEMPLATE_V1 } from "./tanstackStartTemplate";

/** One deterministic full-stack starter. No React SPA or HTML templates. */
export type BuildTemplateTextFile = Readonly<{ path: string; content: string }>;
export type BuildDependencyLockPolicy = Readonly<{
  manager: "pnpm";
  policy: "generate-once";
  lockfilePath: "pnpm-lock.yaml";
}>;
export type BuildTemplateDefinition = Readonly<{
  id: string;
  stackIds: readonly string[];
  workspaceLanguage: WorkspaceStateV2["language"];
  files: readonly BuildTemplateTextFile[];
  entryPath: string;
  activePath?: string;
  openPaths?: readonly string[];
  leftPct?: number;
  dependencyLock: BuildDependencyLockPolicy | null;
}>;

export const BUILD_TEMPLATES_V1 = [
  TANSTACK_START_TEMPLATE_V1,
] as const satisfies readonly BuildTemplateDefinition[];

function assertTemplateRegistry(templates: readonly BuildTemplateDefinition[]): void {
  const seen = new Set<string>();
  for (const template of templates) {
    if (seen.has(template.id)) throw new Error(`Duplicate ZoeBuild template: ${template.id}`);
    seen.add(template.id);
    if (!template.files.length) throw new Error(`Empty ZoeBuild template: ${template.id}`);
  }
}
assertTemplateRegistry(BUILD_TEMPLATES_V1);

export function listBuildTemplates(): readonly BuildTemplateDefinition[] {
  return BUILD_TEMPLATES_V1;
}
export function getBuildTemplate(templateId: string): BuildTemplateDefinition | undefined {
  return BUILD_TEMPLATES_V1.find((template) => template.id === templateId);
}
export function requireBuildTemplate(templateId: string): BuildTemplateDefinition {
  const template = getBuildTemplate(templateId);
  if (!template) throw new Error(`Unsupported ZoeBuild template: ${templateId}`);
  return template;
}
