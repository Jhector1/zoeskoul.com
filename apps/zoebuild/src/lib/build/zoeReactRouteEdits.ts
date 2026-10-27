/**
 * V12K3: deterministic route wiring for already-authorized React/Vite projects.
 * The model writes page presentation; route imports, URLs and navigation are
 * controlled by ZoeBuild. This module makes NO provider or commerce changes.
 */
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";

const ROUTE = /^\/[a-z][a-z0-9-]{0,47}$/;
const SOURCE_PAGE = /^src\/pages\/([a-z][a-z0-9-]{0,47})\.tsx$/;
const RESERVED = new Set(["api", "assets", "sites", "admin", "billing", "auth", "favicon", "src", "__zoebuild"]);
export const ZOE_REACT_ROUTER_MARKER = "// @zoebuild-react-router-v1";

export function isZoeReactPageRoute(route: unknown): route is string {
  return typeof route === "string" && ROUTE.test(route) && !RESERVED.has(route.slice(1));
}
export function isZoeReactPageSourcePath(path: unknown): path is string {
  return typeof path === "string" && SOURCE_PAGE.test(path) && !RESERVED.has(path.slice(10, -4));
}
export function pageSourcePath(route: string): string {
  if (!isZoeReactPageRoute(route)) throw new Error("BUILD_REACT_ROUTE_INVALID");
  return `src/pages/${route.slice(1)}.tsx`;
}
export function listReactPageSlugs(workspace: WorkspaceStateV2): string[] {
  return workspace.nodes.flatMap(node => node.kind === "file"
    ? [pathOf(workspace.nodes, node.id)] : [])
    .filter(isZoeReactPageSourcePath)
    .map(path => path.slice("src/pages/".length, -4))
    .sort();
}
function routeLabel(slug: string): string {
  return slug.split("-").map(word => word[0]!.toUpperCase() + word.slice(1)).join(" ");
}
/** Generate the React Router route registry for modern React/Vite projects. */
export function renderZoeReactRouter(slugs: readonly string[], sharedLayout = true): string {
  const unique = [...new Set(slugs)].sort();
  if (unique.some(slug => !isZoeReactPageRoute(`/${slug}`))) {
    throw new Error("BUILD_REACT_ROUTE_INVALID");
  }
  const imports = unique.map((slug, i) => `import Page${i} from "../pages/${slug}";`).join("\n");
  const routeEntries = unique.map((slug, i) =>
    `        <Route path=${JSON.stringify(slug)} element={<Page${i} />} />`).join("\n");
  const layoutImport = sharedLayout ? 'import SiteLayout from "../layouts/SiteLayout";\n' : "";
  const open = sharedLayout ? '      <Route element={<SiteLayout />}>\n' : "";
  const close = sharedLayout ? '      </Route>\n' : "";
  return `${ZOE_REACT_ROUTER_MARKER}\nimport { Route, Routes } from "react-router";\nimport App from "../App";\nimport NotFound from "../pages/NotFound";\n${layoutImport}${imports}\n\nexport function AppRoutes() {\n  return (\n    <Routes>\n${open}        <Route index element={<App />} />\n${routeEntries}\n        <Route path="*" element={<NotFound />} />\n${close}    </Routes>\n  );\n}\n`;
}

/** Do not silently rewrite a previous project's bootstrap. */
export function wireZoeReactEntry(source: string): string {
  if (source.includes('from "./routes/AppRoutes"') &&
      /<BrowserRouter\b/.test(source) && /<AppRoutes\s*\/>/.test(source)) return source;
  throw new Error("BUILD_REACT_ENTRY_UNSUPPORTED");
}
