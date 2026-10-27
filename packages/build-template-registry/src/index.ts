import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";

/**
 * Provider-neutral source templates for ZoeBuild.
 *
 * Templates are deliberately boring, deterministic starting points. Zoe/AI
 * edits happen after materialization and revision creation; the model does not
 * get to invent an unsupported project structure from scratch.
 */

export type BuildTemplateTextFile = Readonly<{
  path: string;
  content: string;
}>;

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

const REACT_PACKAGE_JSON = `{
  "name": "zoe-build-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-router": "7.18.4"
  },
  "devDependencies": {
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.4",
    "typescript": "6.0.3",
    "vite": "8.1.5"
  }
}
`;

const REACT_INDEX_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Zoé Build</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const REACT_MAIN = String.raw`import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { AppRoutes } from "./routes/AppRoutes";
import { getRouterBasename } from "./lib/routerBasename";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={getRouterBasename()}>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
);
`;

// One SPA router, used by both the preview gateway and published project URLs.
const REACT_ROUTER_BASENAME = String.raw`/**
 * In Preview, the navigation bridge restores a capability-scoped URL before
 * the app mounts. Published sites use /sites/:projectId; local Vite uses /.
 * This function does not grant access or rewrite arbitrary URLs.
 */
export function getRouterBasename(pathname = window.location.pathname): string {
  const preview = /^(\/api\/build\/projects\/[^/]+\/preview\/preview_[a-f\d-]+\/content\/[A-Za-z0-9_-]{32})(?:\/|$)/.exec(pathname);
  if (preview) return preview[1]!;
  const published = /^(\/sites\/[^/]+)(?:\/|$)/.exec(pathname);
  return published?.[1] ?? "/";
}
`;

const REACT_SITE_DATA = String.raw`export const site = {
  name: "Zoé Build",
  tagline: "Build something worth sharing.",
  description: "A modern React + Vite starter with room for your ideas.",
  navigation: [
    { to: "/", label: "Home", end: true },
    { to: "/about", label: "About", end: true },
  ],
} as const;
`;

const REACT_SITE_HEADER = String.raw`import { Link, NavLink } from "react-router";
import { site } from "../data/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="site-brand" to="/">{site.name}</Link>
      <nav className="site-nav" aria-label="Main navigation">
        {site.navigation.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}
            className={({ isActive }) => isActive ? "site-link active" : "site-link"}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
`;

const REACT_SITE_FOOTER = String.raw`import { Link } from "react-router";
import { site } from "../data/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} {site.name}</span>
      <Link to="/">Home</Link>
    </footer>
  );
}
`;

const REACT_TITLE_HOOK = String.raw`import { useEffect } from "react";
import { site } from "../data/site";

/** Keep reusable custom hooks here; built-in React hooks stay in components. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? title + " | " + site.name : site.name;
  }, [title]);
}
`;

const REACT_SITE_LAYOUT = String.raw`import { Outlet, useLocation } from "react-router";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function SiteLayout() {
  const { pathname } = useLocation();
  useDocumentTitle(pathname === "/" ? undefined :
    pathname === "/about" ? "About" : undefined);
  return (
    <div className="site-shell">
      <SiteHeader />
      <main id="content"><Outlet /></main>
      <SiteFooter />
    </div>
  );
}
`;

// Stable edit point for the page generator and Zoé's project-wide refactors.
const REACT_ROUTES = String.raw`// @zoebuild-react-router-v1
import { Route, Routes } from "react-router";
import App from "../App";
import About from "../pages/about";
import NotFound from "../pages/NotFound";
import SiteLayout from "../layouts/SiteLayout";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<App />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
`;


const REACT_ABOUT = String.raw`import { site } from "../data/site";

export default function About() {
  return <section className="page-shell">
    <p className="eyebrow">About</p>
    <h1>A good foundation for what comes next.</h1>
    <p>{site.description}</p>
  </section>;
}
`;

const REACT_NOT_FOUND = String.raw`import { Link } from "react-router";

export default function NotFound() {
  return <section className="page-shell">
    <h1>Page not found</h1>
    <p>The page you requested is not available.</p>
    <Link to="/">Return home</Link>
  </section>;
}
`;

const REACT_APP = String.raw`import { Link } from "react-router";
import { site } from "./data/site";

export default function App() {
  return (
    <section className="page-shell" id="top">
      <p className="eyebrow">Built with Zoé</p>
      <h1>{site.tagline}</h1>
      <p>{site.description}</p>
      <Link className="button-link" to="/about">Explore the starter</Link>
    </section>
  );
}
`;

const REACT_CSS = String.raw`:root {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color: #111827;
  background: #f8fafc;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

.page-shell {
  width: min(760px, calc(100% - 32px));
  margin: 0 auto;
  padding: 96px 0;
}

.eyebrow {
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  font-size: clamp(2.5rem, 8vw, 5rem);
  line-height: 0.98;
  margin: 16px 0 24px;
}

.site-shell { min-height: 100vh; display: flex; flex-direction: column; }
.site-shell main { flex: 1; }
.site-header, .site-footer { width: min(1160px, calc(100% - 32px)); margin-inline: auto; padding-block: 24px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; }
.site-header { border-bottom: 1px solid #dce2ea; }
.site-footer { border-top: 1px solid #dce2ea; font-size: 0.85rem; }
.site-brand { font-weight: 800; }
.site-nav { display: flex; gap: 20px; }
.site-link.active { text-decoration: underline; text-underline-offset: 5px; }
a { color: inherit; }
.button-link { display: inline-block; margin-top: 20px; padding: 12px 20px; border: 1px solid #111827; border-radius: 999px; text-decoration: none; }
`;

const REACT_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "vite.config.ts"]
}
`;

const REACT_VITE_CONFIG = String.raw`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // ZoeBuild preview uses capability-scoped HTTP and an explicit refresh.
  // Do not create an inaccessible HMR WebSocket from sandboxed previews.
  server: { hmr: false },
});
`;

export const REACT_VITE_TEMPLATE_V1 = {
  id: "react-vite-v1",
  stackIds: ["react-vite-v1"],
  workspaceLanguage: "web",
  files: [
    { path: "package.json", content: REACT_PACKAGE_JSON },
    { path: "index.html", content: REACT_INDEX_HTML },
    { path: "src/main.tsx", content: REACT_MAIN },
    { path: "src/lib/routerBasename.ts", content: REACT_ROUTER_BASENAME },
    { path: "src/routes/AppRoutes.tsx", content: REACT_ROUTES },
    { path: "src/data/site.ts", content: REACT_SITE_DATA },
    { path: "src/hooks/useDocumentTitle.ts", content: REACT_TITLE_HOOK },
    { path: "src/layouts/SiteLayout.tsx", content: REACT_SITE_LAYOUT },
    { path: "src/components/SiteHeader.tsx", content: REACT_SITE_HEADER },
    { path: "src/components/SiteFooter.tsx", content: REACT_SITE_FOOTER },
    { path: "src/pages/about.tsx", content: REACT_ABOUT },
    { path: "src/pages/NotFound.tsx", content: REACT_NOT_FOUND },
    { path: "src/App.tsx", content: REACT_APP },
    { path: "src/styles.css", content: REACT_CSS },
    { path: "tsconfig.json", content: REACT_TSCONFIG },
    { path: "vite.config.ts", content: REACT_VITE_CONFIG },
  ],
  entryPath: "src/main.tsx",
  activePath: "src/App.tsx",
  openPaths: ["src/App.tsx", "src/styles.css", "src/main.tsx"],
  leftPct: 26,
  dependencyLock: {
    manager: "pnpm",
    policy: "generate-once",
    lockfilePath: "pnpm-lock.yaml",
  },
} as const satisfies BuildTemplateDefinition;

export const BUILD_TEMPLATES_V1 = [
  REACT_VITE_TEMPLATE_V1,
] as const satisfies readonly BuildTemplateDefinition[];

function assertTemplateRegistry(
  templates: readonly BuildTemplateDefinition[],
): void {
  const seen = new Set<string>();

  for (const template of templates) {
    if (seen.has(template.id)) {
      throw new Error(`Duplicate ZoeBuild template id: ${template.id}`);
    }
    seen.add(template.id);

    if (!template.files.length) {
      throw new Error(`ZoeBuild template has no files: ${template.id}`);
    }
  }
}

assertTemplateRegistry(BUILD_TEMPLATES_V1);

export function listBuildTemplates(): readonly BuildTemplateDefinition[] {
  return BUILD_TEMPLATES_V1;
}

export function getBuildTemplate(
  templateId: string,
): BuildTemplateDefinition | undefined {
  return BUILD_TEMPLATES_V1.find((template) => template.id === templateId);
}

export function requireBuildTemplate(
  templateId: string,
): BuildTemplateDefinition {
  const template = getBuildTemplate(templateId);
  if (!template) {
    throw new Error(`Unsupported ZoeBuild template: ${templateId}`);
  }
  return template;
}
