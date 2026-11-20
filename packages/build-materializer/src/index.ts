import { applyBuildDesignToTemplate } from "./commerceDesign";
import { parseBuildDesignSpecification } from "@zoeskoul/build-contracts";
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

/** Application-neutral scaffold. A plan describes screens, not a mandatory website shell. */
function prepareTanstackPresentation(
  specification: ProjectSpecification,
  template: BuildTemplateDefinition,
): BuildTemplateDefinition {
  if (specification.stackId !== "tanstack-start-v1") return template;
  const files = new Map(template.files.map(file => [file.path, file.content]));
  if (files.size !== template.files.length) throw new Error("Duplicate TanStack template path");
  const set = (path: string, content: string) => {
    if (!files.has(path)) throw new Error(`Unexpected TanStack presentation surface: ${path}`);
    files.set(path, content);
  };
  const add = (path: string, content: string) => {
    if (files.has(path)) throw new Error(`TanStack presentation path collision: ${path}`);
    files.set(path, content);
  };
  const json = (value: unknown) => JSON.stringify(value);
  // The reference template is unchanged. Strip its example website chrome from generated apps.
  for (const path of ["src/routes/about.tsx", "src/components/SiteHeader.tsx", "src/components/SiteFooter.tsx"]) {
    if (!files.delete(path)) throw new Error(`Unexpected TanStack presentation surface: ${path}`);
  }
  set("src/layouts/SiteLayout.tsx", [
    'import { Outlet } from "@tanstack/react-router";',
    'export function SiteLayout() { return <main id="main-content"><Outlet /></main>; }', '',
  ].join("\n"));
  const navigation: { to: string; label: string }[] = [];
  const labels = new Set<string>();
  const used = new Set(["index", "route", "api", "root"]);
  for (const [index, raw] of specification.pages.entries()) {
    const label = raw.trim();
    const key = label.normalize("NFKC").toLowerCase();
    if (!label || labels.has(key)) continue;
    labels.add(key);
    if (navigation.length === 0) {
      navigation.push({ to: "/", label });
      continue;
    }
    const base = key.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)
      .replace(/-+$/g, "") || `page-${index + 1}`;
    let slug = base;
    for (let suffix = 2; used.has(slug) || files.has(`src/routes/${slug}.tsx`); suffix++) {
      slug = `${base}-${suffix}`;
    }
    used.add(slug);
    navigation.push({ to: `/${slug}`, label });
    add(`src/routes/${slug}.tsx`, [
      'import { createFileRoute } from "@tanstack/react-router";',
      'import { PlannedPage } from "../components/PlannedPage";',
      `export const Route = createFileRoute(${json(`/${slug}`)})({`,
      `  head: () => ({ meta: [{ title: ${json(label)} }] }),`,
      `  component: () => <PlannedPage title={${json(label)}} />,`,
      '});', '',
    ].join("\n"));
  }
  const design = specification.design ? parseBuildDesignSpecification(specification.design) : null;
  const site = files.get("src/data/site.ts");
  if (site === undefined) throw new Error("Missing TanStack site data");
  // Retain the existing identity contract consumed by the trusted application service.
  set("src/data/site.ts", [
    'export const site = {',
    '  name: "My Website",',
    '  tagline: "Welcome to My Website",',
    `  description: ${json(design?.content.heroBody ?? "Application scaffold; implementation pending.")},`,
    ...(design ? [`  heroTitle: ${json(design.content.heroTitle)},`, `  heroEyebrow: ${json(design.content.eyebrow)},`] : []),
    `  navigation: ${json(navigation)},`,
    '} as const;', '',
  ].join("\n"));
  add("src/components/PlannedPage.tsx", [
    'import type { ReactNode } from "react";',
    'export function PlannedPage({ title, description, children }: Readonly<{ title: string; description?: string; children?: ReactNode }>) {',
    '  return <section className="page-shell"><h1>{title}</h1>',
    '    {description && <p>{description}</p>}',
    '    <p>This screen is a starting point. Its content and functionality still need implementation.</p>',
    '    {children}',
    '  </section>;', '}', '',
  ].join("\n"));
  const entry = navigation[0];
  const otherPages = navigation.slice(1);
  // Optional scaffold links expose planned routes, not a persistent site navigation shell.
  set("src/routes/index.tsx", [
    `import { createFileRoute${otherPages.length ? ", Link" : ""} } from "@tanstack/react-router";`,
    'import { PlannedPage } from "../components/PlannedPage";',
    'import { site } from "../data/site";',
    'export const Route = createFileRoute("/")({',
    `  head: () => ({ meta: [{ title: site.name${entry ? ` + ${json(` | ${entry.label}`)}` : ""} }] }),`,
    '  component: EntryScreen,', '});', '',
    'function EntryScreen() {',
    `  return <PlannedPage title={${design ? "site.heroTitle" : entry ? json(entry.label) : "site.name"}}${design ? " description={site.description}" : ""}>`,
    ...(otherPages.length ? [
      '    <ul aria-label="Other planned screens">',
      ...otherPages.map(page => `      <li><Link to={${json(page.to)}}>{${json(page.label)}}</Link></li>`),
      '    </ul>',
    ] : []),
    '  </PlannedPage>;', '}', '',
  ].join("\n"));
  const root = files.get("src/routes/__root.tsx");
  if (root === undefined || root.split('<a href="/">Back to home</a>').length !== 2) {
    throw new Error("Unexpected TanStack root document");
  }
  set("src/routes/__root.tsx", root
    .replace("createRootRoute, HeadContent, Scripts", "createRootRoute, HeadContent, Scripts, Link")
    .replace('<a href="/">Back to home</a>', '<Link to="/">Return to application</Link>'));
  // Only neutral scaffold styles; actual application layout is an agent implementation decision.
  set("src/styles.css", [
    `:root { font-family: ui-sans-serif, system-ui, sans-serif; color: ${design?.palette.text ?? "#172033"}; background: ${design?.palette.surface ?? "#f8fafc"}; }`,
    '* { box-sizing: border-box; }',
    'body { margin: 0; }',
    'a { color: inherit; }',
    '.skip-link { position: absolute; left: -999px; top: 0; padding: 12px; background: white; color: black; }',
    '.skip-link:focus { left: 12px; z-index: 100; }',
    '.page-shell { width: min(800px, calc(100% - 32px)); margin: 32px auto; }',
    '.page-shell p { line-height: 1.6; }',
    ...(design ? [
      `.page-shell a { color: ${design.palette.accent}; }`,
      `.page-shell h1 { letter-spacing: ${{ minimal: "-.045em", editorial: "-.06em", bold: "-.07em", luxury: "-.035em", playful: "-.025em", technical: "-.04em" }[design.style]}; }`,
      ...(design.layout.hero === "centered" ? ['.page-shell { text-align: center; }'] :
        design.layout.hero === "editorial" ? ['.page-shell { width: min(940px, calc(100% - 36px)); }'] : []),
    ] : []),
    '',
  ].join("\n"));
  return { ...template, files: Array.from(files, ([path, content]) => ({ path, content })) };
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
  const stack =
    requireBuildStack(
      args.specification.stackId,
    );

  const registeredTemplate =
    requireBuildTemplate(
      stack.templateId,
    );

  const template = prepareTanstackPresentation(
    args.specification,
    applyBuildDesignToTemplate(args.specification, registeredTemplate),
  );

  return materializeBuildProject({
    specification:
      args.specification,

    stack,
    template,

    createdAt:
      args.createdAt,
  });
}

export {
  COMMERCE_STOREFRONT_DESIGN_PATHS,
  applyBuildDesignToTemplate,
  renderCommerceStorefrontDesignFiles,
} from "./commerceDesign";
