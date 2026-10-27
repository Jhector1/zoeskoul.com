import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";

/**
 * Read-only design references for an existing React/Vite project.
 * Never use these references as an edit allowlist: the canonical source-edit
 * validator still owns all write authorization and source-version checks.
 */
export type ZoeReactDesignReference = Readonly<{
  path: string;
  content: string;
  truncated: boolean;
  role: "homepage" | "stylesheet" | "shared-component" | "entry" | "existing-page";
}>;
export type ZoeReactDesignEvidence = Readonly<{
  files: readonly ZoeReactDesignReference[];
  sourceCoverage: "bounded-partial-evidence";
  omittedPaths: readonly string[];
  designPrinciples: readonly string[];
  // Path/import metadata covers all safe source files, independent of focused tab.
  // This is an advisory map for semantic reasoning, NOT an edit allowlist.
  sourceInventory: readonly Readonly<{path: string; imports: readonly string[]}>[];
}>;

const MAX_TOTAL_CHARS = 48_000;
const MAX_REFERENCE_SOURCE_CHARS = 160_000;
const SENSITIVE_TEXT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk-proj-|sk_live_|ghp_|xox[baprs]-)[A-Za-z0-9_-]{12,}/;
const SOURCE_ROOT = /^src\/(?:App\.tsx|main\.tsx|(?:App|index|styles|globals)\.css|(?:components|layouts|routes|hooks|data|lib|utils|context|providers|services)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:ts|tsx|jsx|css|json)|pages\/[A-Za-z0-9-]+\.tsx)$/;
const EXTRA_ROOT = /^(?:index\.html|styles\.css)$/;

function allowedReferencePath(path: string): boolean {
  return (SOURCE_ROOT.test(path) || EXTRA_ROOT.test(path)) &&
    !path.split("/").some(part => part.startsWith(".") || part === "node_modules");
}

function localImportPaths(importer: string, source: string): string[] {
  const results: string[] = [];
  // Match conventional local ES import declarations and CSS side-effect imports.
  // This discovers candidate paths only; each candidate must exist in the
  // trusted workspace and independently pass the strict reference allowlist.
  const pattern = /\b(?:from\s*|import\s*(?:\(\s*)?)["']((?:\.{1,2}\/|@\/)[^"']{1,160})["']/g;
  let found: RegExpExecArray | null;
  while ((found = pattern.exec(source)) !== null) {
    const ref = found[1]!;
    const alias = ref.startsWith("@/");
    if (!alias && !ref.startsWith("./") && !ref.startsWith("../")) continue;
    const parts = alias ? ["src"] : importer.split("/").slice(0, -1);
    let valid = true;
    for (const part of (alias ? ref.slice(2) : ref).split("/")) {
      if (part === "." || !part) continue;
      if (part === "..") { if (parts.length <= 1) {valid = false; break;} parts.pop(); }
      else if (/^[A-Za-z0-9_.-]+$/.test(part)) parts.push(part);
      else {valid = false; break;}
    }
    if (!valid) continue;
    const path = parts.join("/");
    for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}.jsx`, `${path}.css`, `${path}.json`, `${path}/index.ts`, `${path}/index.tsx`]) {
      if (allowedReferencePath(candidate) && !results.includes(candidate)) results.push(candidate);
    }
  }
  return results;
}

function excerpt(content: string, budget: number, role: ZoeReactDesignReference["role"]): string {
  if (content.length <= budget) return content;
  // Preserve both the beginning (imports, design tokens, layout) and ending
  // (footer, export, page closing) instead of hiding the entire latter half.
  const tail = role === "homepage" || role === "existing-page" ? Math.min(2_400, Math.floor(budget / 5)) :
    role === "stylesheet" ? Math.min(1_600, Math.floor(budget / 5)) : 0;
  if (!tail) return content.slice(0, budget);
  return `${content.slice(0, budget - tail - 56)}\n/* … source omitted for bounded reference … */\n${content.slice(-tail)}`.slice(0, budget);
}

export function selectZoeReactDesignEvidence(
  workspace: WorkspaceStateV2,
  targetPage: string,
): ZoeReactDesignEvidence {
  const sources = new Map<string, string>();
  const oversized: string[] = [];
  for (const node of workspace.nodes) {
    if (node.kind !== "file" || node.binary) continue;
    const path = pathOf(workspace.nodes, node.id);
    if (!allowedReferencePath(path)) continue;
    if (node.content.length > MAX_REFERENCE_SOURCE_CHARS) {oversized.push(path); continue;}
    // Never leak a credential accidentally pasted into a design file.
    if (SENSITIVE_TEXT.test(node.content)) continue;
    sources.set(path, node.content);
  }
  const preferred: Array<{path: string; role: ZoeReactDesignReference["role"]; limit: number}> = [];
  function add(path: string, role: ZoeReactDesignReference["role"], limit: number) {
    if (sources.has(path) && !preferred.some(item => item.path === path)) preferred.push({path, role, limit});
  }
  add("src/App.tsx", "homepage", 16_000);
  const app = sources.get("src/App.tsx") ?? "";
  const main = sources.get("src/main.tsx") ?? "";
  const imported = [...localImportPaths("src/App.tsx", app), ...localImportPaths("src/main.tsx", main)];
  // Styles must not depend on the active editor tab or incidental sort order.
  for (const style of [...imported.filter(p => p.endsWith(".css")),
    "src/App.css", "src/index.css", "src/styles.css", "src/globals.css", "styles.css"])
    add(style, "stylesheet", 7_200);
  const components = imported.filter(p => p.startsWith("src/components/") && /\.(?:tsx|jsx)$/.test(p));
  for (const component of components) add(component, "shared-component", 5_000);
  // One additional import hop captures shared headers/layouts referenced by App.
  for (const component of components.slice(0, 3)) {
    const text = sources.get(component);
    if (!text) continue;
    for (const importedComponent of localImportPaths(component, text)) {
      if (importedComponent.startsWith("src/components/") && /\.(?:tsx|jsx|css)$/.test(importedComponent)) {
        add(importedComponent, importedComponent.endsWith(".css") ? "stylesheet" : "shared-component", 4_000);
      }
    }
  }
  const omittedPaths: string[] = [...oversized];
  // Sample sibling pages to reveal the existing site-wide composition pattern.
  // Read-only context: no new write permissions or route changes.
  const siblingPages = [...sources.keys()]
    .filter(path => /^src\/pages\/[a-z0-9-]+\.tsx$/.test(path) && path !== targetPage)
    .sort();
  // The model can see how pages compose site-level chrome, not just three samples.
  // Source text stays under the existing total character budget.
  for (const page of siblingPages.slice(0, 10)) add(page, "existing-page", 3_500);
  omittedPaths.push(...siblingPages.slice(10));
  // Include existing shared components even if the homepage does not import them.
  for (const component of [...sources.keys()].filter(path =>
    path.startsWith("src/components/") && /\.(?:tsx|jsx)$/.test(path)).sort().slice(0, 10)) {
    add(component, "shared-component", 3_000);
  }
  // Ground decisions in actual modern architecture modules, not just page bodies.
  for (const p of [...sources.keys()].filter(path =>
    /^src\/(?:routes|layouts|data|hooks|lib|context|providers|utils|services)\//.test(path)
  ).sort().slice(0, 24)) {
    add(p, "shared-component", 3_000);
  }
  add("src/main.tsx", "entry", 1_500);
  add("index.html", "entry", 1_200);
  if (/^src\/pages\/[a-z0-9-]+\.tsx$/.test(targetPage)) add(targetPage, "existing-page", 8_000);

  const files: ZoeReactDesignReference[] = [];
  let remaining = MAX_TOTAL_CHARS;
  for (const item of preferred) {
    const content = sources.get(item.path)!;
    const allowed = Math.min(remaining, item.limit);
    if (allowed < 300) {omittedPaths.push(item.path); continue;}
    const selected = excerpt(content, allowed, item.role);
    files.push({path: item.path, role: item.role, content: selected, truncated: selected.length < content.length});
    remaining -= selected.length;
  }
  const sourceInventory = [...sources.keys()].sort().slice(0, 120).map(path => ({
    path,
    imports: localImportPaths(path, sources.get(path)!).filter(dependency => sources.has(dependency)).slice(0, 16),
  }));
  return {
    files,
    sourceInventory,
    sourceCoverage: "bounded-partial-evidence",
    omittedPaths: [...new Set(omittedPaths)].sort(),
    designPrinciples: [
      "Reuse the actual site's typography, spacing, colors, CSS classes and existing components wherever source evidence supports them.",
      "Prefer installed, established React/Vite APIs. For new sites use React Router, shared Outlet layouts, Link and NavLink rather than custom history interception; never install a competing router alongside an existing one.",
      "Use src/hooks for reusable custom hooks, src/data for structured content, src/layouts for shared composition, and src/routes for declarative route configuration when warranted. Do not split every literal into a pointless abstraction.",
      "Zoé should autonomously choose reversible architecture and component changes that serve the user's request; server-side authorization, secret restrictions, dependency integrity and mandatory verification remain binding.",
      "Treat the existing site-wide header, navigation and footer as shared structure. Do not duplicate them in newly generated page components.",
      "Compare sibling page composition and existing imports before writing a new page. Reuse real shared components rather than generating lookalike replacements.",
      "If no shared layout exists, you may propose extracting one into a new src/components file and updating existing pages together, without changing the visual design.",
      "Use sourceInventory for project-wide dependency awareness. Files whose bodies are omitted must not be edited without additional evidence.",
      "Avoid copying site-wide markup across routes; site layout reuse is an architecture decision, not a keyword-triggered template.",
      "Retain the user's requested content and the existing homepage; if something cannot be preserved from available evidence, report that limitation rather than claiming design parity.",
    ],
  };
}
