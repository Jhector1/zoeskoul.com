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

const STATIC_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Zoé Build</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="page-shell">
      <p class="eyebrow">Built with Zoé</p>
      <h1>Your site is ready to customize.</h1>
      <p>Edit the files or ask Zoé to turn this starter into your website.</p>
      <button id="hello-button" type="button">Try it</button>
    </main>
    <script type="module" src="./script.js"></script>
  </body>
</html>
`;

const STATIC_CSS = String.raw`:root {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color: #111827;
  background: #f8fafc;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
}

.page-shell {
  width: min(720px, calc(100% - 32px));
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

button {
  border: 0;
  border-radius: 999px;
  padding: 12px 18px;
  font: inherit;
  cursor: pointer;
}
`;

const STATIC_JS = String.raw`const button = document.querySelector("#hello-button");

button?.addEventListener("click", () => {
  button.textContent = "It works";
});
`;

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
    "react-dom": "19.2.3"
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
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

const REACT_APP = String.raw`export default function App() {
  return (
    <main className="page-shell">
      <p className="eyebrow">Built with Zoé</p>
      <h1>Your app is ready to customize.</h1>
      <p>
        This is the controlled React + Vite starter. Ask Zoé to build on top
        of it or edit the frontend directly.
      </p>
    </main>
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
});
`;

export const STATIC_HTML_TEMPLATE_V1 = {
  id: "static-html-v1",
  stackIds: ["static-html-v1"],
  workspaceLanguage: "web",
  files: [
    { path: "index.html", content: STATIC_HTML },
    { path: "styles.css", content: STATIC_CSS },
    { path: "script.js", content: STATIC_JS },
  ],
  entryPath: "index.html",
  activePath: "index.html",
  openPaths: ["index.html", "styles.css", "script.js"],
  leftPct: 26,
  dependencyLock: null,
} as const satisfies BuildTemplateDefinition;

export const REACT_VITE_TEMPLATE_V1 = {
  id: "react-vite-v1",
  stackIds: ["react-vite-v1"],
  workspaceLanguage: "web",
  files: [
    { path: "package.json", content: REACT_PACKAGE_JSON },
    { path: "index.html", content: REACT_INDEX_HTML },
    { path: "src/main.tsx", content: REACT_MAIN },
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
  STATIC_HTML_TEMPLATE_V1,
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
