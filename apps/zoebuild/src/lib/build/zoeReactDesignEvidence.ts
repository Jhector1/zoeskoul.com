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
}>;

const MAX_TOTAL_CHARS = 48_000;
const MAX_REFERENCE_SOURCE_CHARS = 160_000;
const SENSITIVE_TEXT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk-proj-|sk_live_|ghp_|xox[baprs]-)[A-Za-z0-9_-]{12,}/;
const SOURCE_ROOT = /^src\/(?:App\.tsx|main\.tsx|(?:App|index|styles|globals)\.css|components\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:tsx|jsx|css)|pages\/[a-z0-9-]+\.tsx)$/;
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
    for (const candidate of [path, `${path}.tsx`, `${path}.jsx`, `${path}.css`, `${path}/index.tsx`]) {
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
  for (const page of siblingPages.slice(0, 3)) add(page, "existing-page", 2_400);
  omittedPaths.push(...siblingPages.slice(3));
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
  return {
    files,
    sourceCoverage: "bounded-partial-evidence",
    omittedPaths: [...new Set(omittedPaths)].sort(),
    designPrinciples: [
      "Reuse the actual site's typography, spacing, colors, CSS classes and existing components wherever source evidence supports them.",
      "Treat the existing site-wide header, navigation and footer as shared structure. Do not duplicate them in newly generated page components.",
      "Compare sibling page composition and existing imports before writing a new page. Reuse real shared components rather than generating lookalike replacements.",
      "Do not invent a new brand design or unverified integration; if canonical shared layout is absent, report the need for a separate approved refactor.",
      "Retain the user's requested content and the existing homepage; if something cannot be preserved from available evidence, report that limitation rather than claiming design parity.",
    ],
  };
}
