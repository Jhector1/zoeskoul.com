import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";
import type { ZoeSourceEdit } from "./zoeTargetedSourceEdit";
import { ZoeEditInputError } from "./zoeTargetedSourceEdit";

/**
 * Fail-closed preflight of local imports and deterministic edit scope.
 * This does NOT execute project code, run Vite, or claim visual correctness.
 * The runner remains the only authority for executable build/preview results.
 */
export type ZoeReactEditReadiness = Readonly<{
  stage: "source-validated";
  build: "not-run";
  browser: "not-run";
  sourceVersion: number;
  changedPaths: readonly string[];
  operations: readonly {path: string; action: "create" | "update"; responsibility: string}[];
  checkedLocalImports: number;
  designEvidenceCoverage: "bounded-partial-evidence";
  message: string;
}>;

const EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".woff", ".woff2"];
const INDEX = ["index.tsx", "index.ts", "index.jsx", "index.js"];
const IMPORTS = /(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"'\n]{1,240})["']/g;
const SAFE_SEGMENT = /^[A-Za-z0-9_.-]+$/;

function localImportTarget(from: string, specifier: string): string | null {
  // External package imports are validated by the real isolated Vite build.
  if (!specifier.startsWith("./") && !specifier.startsWith("../") && !specifier.startsWith("@/")) return null;
  const pathOnly = specifier.split(/[?#]/, 1)[0] ?? "";
  const segments = specifier.startsWith("@/") ? ["src"] : from.split("/").slice(0, -1);
  for (const segment of (specifier.startsWith("@/") ? pathOnly.slice(2) : pathOnly).split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length <= 1) throw new ZoeEditInputError("BUILD_REACT_IMPORT_UNSAFE", "A proposed React import escapes the project source directory.");
      segments.pop();
    } else if (!SAFE_SEGMENT.test(segment) || segment.startsWith(".")) {
      throw new ZoeEditInputError("BUILD_REACT_IMPORT_UNSAFE", "A proposed React import contains an unsupported path segment.");
    } else segments.push(segment);
  }
  const target = segments.join("/");
  if (!target.startsWith("src/") || target.includes("/node_modules/")) {
    throw new ZoeEditInputError("BUILD_REACT_IMPORT_UNSAFE", "A proposed React import escapes the supported source tree.");
  }
  return target;
}

function hasTarget(target: string, sources: ReadonlyMap<string,string>): boolean {
  if (sources.has(target)) return true;
  for (const ext of EXTENSIONS) if (ext && sources.has(target + ext)) return true;
  for (const index of INDEX) if (sources.has(target + "/" + index)) return true;
  return false;
}

function responsibility(path: string, requestedPage: string): string {
  if (path === requestedPage) return "React page content";
  if (path === "src/App.tsx") return "Existing homepage and visible navigation";
  if (path === "src/main.tsx") return "Deterministic React entry wiring";
  if (path === "src/ZoePages.tsx") return "Deterministic route registry";
  return "Reviewed existing source";
}

/** Must be called only AFTER validateZoeEdits; cannot expand its write allowlist. */
export function verifyZoeReactEditSources(input: {
  workspace: WorkspaceStateV2;
  edits: readonly ZoeSourceEdit[];
  requestedPage: string;
  sourceVersion: number;
}): ZoeReactEditReadiness {
  const { workspace, edits, requestedPage, sourceVersion } = input;
  if (!/^src\/pages\/[a-z][a-z0-9-]{0,47}\.tsx$/.test(requestedPage)) {
    throw new ZoeEditInputError("BUILD_REACT_ROUTE_INVALID", "The requested page is not a supported React route.");
  }
  if (!edits.some(item => item.path === requestedPage)) {
    throw new ZoeEditInputError("BUILD_REACT_ROUTE_INVALID", "The proposed page source is missing.");
  }
  const sources = new Map<string,string>();
  for (const node of workspace.nodes) {
    if (node.kind === "file" && !node.binary) sources.set(pathOf(workspace.nodes, node.id), node.content);
  }
  for (const edit of edits) sources.set(edit.path, edit.content);

  let checkedLocalImports = 0;
  for (const edit of edits) {
    if (!/\.(?:tsx|jsx|ts|js)$/.test(edit.path)) continue;
    const re = new RegExp(IMPORTS.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(edit.content)) !== null) {
      const target = localImportTarget(edit.path, match[1]!);
      if (!target) continue;
      checkedLocalImports += 1;
      if (!hasTarget(target,sources)) {
        throw new ZoeEditInputError("BUILD_REACT_IMPORT_UNRESOLVED", `${edit.path}: the proposed local import ${match[1]} does not resolve to a project file. No source was changed.`);
      }
    }
  }
  const operations = edits.map(edit => ({path:edit.path,
    action: edit.create ? "create" as const : "update" as const,
    responsibility:responsibility(edit.path,requestedPage)}));
  return {
    stage:"source-validated", build:"not-run", browser:"not-run", sourceVersion,
    changedPaths:operations.map(item=>item.path), operations, checkedLocalImports,
    designEvidenceCoverage:"bounded-partial-evidence",
    message:"The proposal passed source and local-import checks. Vite compilation, rendering and visual fidelity have not been tested.",
  };
}

/** A deterministic plan, not a second billable AI call or a user-intent keyword classifier. */
export function planZoeReactPageEdit(requestedPage: string, referencePaths: readonly string[], incomplete: readonly string[]) {
  const target = /^\/[a-z][a-z0-9-]{0,47}$/.test(requestedPage)
    ? `src/pages/${requestedPage.slice(1)}.tsx` : null;
  if (!target) throw new ZoeEditInputError("BUILD_REACT_ROUTE_INVALID", "Unsupported React page route.");
  return {
    destination:requestedPage,
    requiredPageFile:target,
    optionalHomepageFile:"src/App.tsx",
    serverOwnedFiles:["src/main.tsx","src/ZoePages.tsx"],
    designReferencePaths:referencePaths,
    missingDesignReferences:incomplete,
    constraints:[
      "Use the real imported components, typography, colors, CSS and nav conventions as read-only references.",
      "Propose a complete page and an App.tsx update only when the requested visible homepage/header changes require it.",
      "Do not claim a Vite build, browser render or integration test was run.",
    ],
  } as const;
}
