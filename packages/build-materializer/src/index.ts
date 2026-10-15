import type {
  BuildStackDefinition,
  ProjectSpecification,
} from "@zoeskoul/build-contracts";
import { evaluateProjectStack } from "@zoeskoul/build-core";
import { requireBuildStack } from "@zoeskoul/build-registry";
import {
  requireBuildTemplate,
  type BuildDependencyLockPolicy,
  type BuildTemplateDefinition,
} from "@zoeskoul/build-template-registry";
import type {
  FSNode,
  WorkspaceStateV2,
} from "@zoeskoul/workspace-contracts";

export type MaterializedBuildProject = Readonly<{
  stackId: string;
  templateId: string;
  workspace: WorkspaceStateV2;
  entryPath: string;
  activePath: string;
  dependencyLock: BuildDependencyLockPolicy | null;
}>;

export type MaterializeBuildProjectInput = Readonly<{
  specification: ProjectSpecification;
  stack: BuildStackDefinition;
  template: BuildTemplateDefinition;
  createdAt: number;
}>;

function assertTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("ZoeBuild materialization requires a non-negative integer createdAt.");
  }
  return value;
}

function normalizeTemplatePath(path: string): string {
  if (typeof path !== "string") {
    throw new Error("ZoeBuild template path must be a string.");
  }

  if (!path || path.trim() !== path) {
    throw new Error(`Invalid ZoeBuild template path: ${JSON.stringify(path)}`);
  }

  if (path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    throw new Error(`Unsafe ZoeBuild template path: ${path}`);
  }

  const parts = path.split("/");
  if (
    parts.some(
      (part) => !part || part === "." || part === "..",
    )
  ) {
    throw new Error(`Unsafe ZoeBuild template path: ${path}`);
  }

  return parts.join("/");
}

function parentPath(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index < 0 ? null : path.slice(0, index);
}

function baseName(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? path : path.slice(index + 1);
}

function ancestorFolderPaths(path: string): string[] {
  const parts = path.split("/");
  const result: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    result.push(parts.slice(0, index).join("/"));
  }
  return result;
}

function validateTemplate(
  template: BuildTemplateDefinition,
): Readonly<{
  files: readonly Readonly<{ path: string; content: string }>[];
  entryPath: string;
  activePath: string;
  openPaths: readonly string[];
}> {
  const files = template.files.map((file) => ({
    path: normalizeTemplatePath(file.path),
    content: file.content,
  }));

  const filePaths = new Set<string>();
  for (const file of files) {
    if (filePaths.has(file.path)) {
      throw new Error(`Duplicate ZoeBuild template file path: ${file.path}`);
    }
    filePaths.add(file.path);
  }

  for (const file of files) {
    for (const folder of ancestorFolderPaths(file.path)) {
      if (filePaths.has(folder)) {
        throw new Error(
          `ZoeBuild template path is both file and folder: ${folder}`,
        );
      }
    }
  }

  const entryPath = normalizeTemplatePath(template.entryPath);
  const activePath = normalizeTemplatePath(template.activePath ?? entryPath);
  const openPaths = Array.from(
    new Set(
      (template.openPaths?.length ? template.openPaths : [activePath]).map(
        normalizeTemplatePath,
      ),
    ),
  );

  for (const requiredPath of [entryPath, activePath, ...openPaths]) {
    if (!filePaths.has(requiredPath)) {
      throw new Error(
        `ZoeBuild template references missing file: ${requiredPath}`,
      );
    }
  }

  return { files, entryPath, activePath, openPaths };
}

function buildWorkspaceNodes(args: {
  files: readonly Readonly<{ path: string; content: string }>[];
  createdAt: number;
}): FSNode[] {
  const folderPaths = new Set<string>();
  for (const file of args.files) {
    for (const folder of ancestorFolderPaths(file.path)) {
      folderPaths.add(folder);
    }
  }

  const folders: FSNode[] = Array.from(folderPaths)
    .sort((a, b) => {
      const depth = a.split("/").length - b.split("/").length;
      return depth || a.localeCompare(b);
    })
    .map((path) => ({
      id: path,
      kind: "folder" as const,
      name: baseName(path),
      parentId: parentPath(path),
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    }));

  const files: FSNode[] = [...args.files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => ({
      id: file.path,
      kind: "file" as const,
      name: baseName(file.path),
      parentId: parentPath(file.path),
      content: file.content,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    }));

  return [...folders, ...files];
}

function expandedFolders(openPaths: readonly string[]): string[] {
  return Array.from(
    new Set(openPaths.flatMap((path) => ancestorFolderPaths(path))),
  ).sort((a, b) => {
    const depth = a.split("/").length - b.split("/").length;
    return depth || a.localeCompare(b);
  });
}

export function materializeBuildProject(
  input: MaterializeBuildProjectInput,
): MaterializedBuildProject {
  const createdAt = assertTimestamp(input.createdAt);

  if (input.specification.stackId !== input.stack.id) {
    throw new Error(
      `ZoeBuild specification selects ${input.specification.stackId}, not ${input.stack.id}.`,
    );
  }

  const compatibility = evaluateProjectStack(input.specification, input.stack);
  if (!compatibility.compatible) {
    const reasons = compatibility.issues
      .map((issue) => `${issue.code}:${issue.value}`)
      .join(", ");
    throw new Error(`ZoeBuild stack is incompatible with specification: ${reasons}`);
  }

  if (input.stack.templateId !== input.template.id) {
    throw new Error(
      `ZoeBuild stack ${input.stack.id} requires template ${input.stack.templateId}, not ${input.template.id}.`,
    );
  }

  if (!input.template.stackIds.includes(input.stack.id)) {
    throw new Error(
      `ZoeBuild template ${input.template.id} does not allow stack ${input.stack.id}.`,
    );
  }

  const validated = validateTemplate(input.template);
  const openTabs = [...validated.openPaths];
  if (!openTabs.includes(validated.activePath)) {
    openTabs.unshift(validated.activePath);
  }

  const workspace: WorkspaceStateV2 = {
    version: 2,
    language: input.template.workspaceLanguage,
    nodes: buildWorkspaceNodes({
      files: validated.files,
      createdAt,
    }),
    openTabs,
    activeFileId: validated.activePath,
    entryFileId: validated.entryPath,
    stdin: "",
    expanded: expandedFolders(openTabs),
    leftPct: input.template.leftPct ?? 26,
  };

  return {
    stackId: input.stack.id,
    templateId: input.template.id,
    workspace,
    entryPath: validated.entryPath,
    activePath: validated.activePath,
    dependencyLock: input.template.dependencyLock,
  };
}

/**
 * Canonical registry-backed entry point used by the future Build application
 * service. Unknown stacks/templates and incompatible specifications fail
 * closed before any source is persisted or executed.
 */
export function materializeRegisteredBuildProject(args: {
  specification: ProjectSpecification;
  createdAt: number;
}): MaterializedBuildProject {
  const stack = requireBuildStack(args.specification.stackId);
  const template = requireBuildTemplate(stack.templateId);

  return materializeBuildProject({
    specification: args.specification,
    stack,
    template,
    createdAt: args.createdAt,
  });
}
