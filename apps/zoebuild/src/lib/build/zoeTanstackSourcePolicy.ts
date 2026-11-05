/**
 * E4A: conservative, server-authoritative edit boundary for TanStack Start UI.
 * Backend routes, server functions, secrets, router bootstrap and generated files
 * are NOT part of an ordinary content/design edit. Those require a separate
 * capability-aware workflow with their own authorization and compilation checks.
 * This is a structural preflight; the trusted build must still compile changes.
 */
const SEGMENT = /^[A-Za-z][A-Za-z0-9_-]*$/;
const ROUTE_SEGMENT = /^[a-z][a-z0-9-]{0,47}$/;
const ROUTE_DECLARATION = /\bcreateFileRoute\s*\(\s*(["'`])([^"'`\r\n]+)\1\s*\)/g;
const SOURCE_FOLDERS = new Set([
  "components", "layouts", "hooks", "data", "lib", "utils", "context", "providers", "styles",
]);
const BLOCKED = new Set([
  "server", "functions", "api", "auth", "secrets", "secret", "node_modules", "dist",
  "generated", "__generated__", "config", "routetree", "env",
]);

export function isTanstackSourceWorkspace(paths: ReadonlySet<string>): boolean {
  return paths.has("src/router.tsx") && paths.has("src/routes/__root.tsx") &&
    !paths.has("src/main.tsx") && !paths.has("src/App.tsx");
}

function safeSegment(segment: string): boolean {
  return SEGMENT.test(segment) && !BLOCKED.has(segment.toLowerCase()) &&
    !segment.startsWith("_");
}

/** The expected public URL for a static, literal TSX page file. */
export function tanstackPageUrl(path: string): string | null {
  if (!path.startsWith("src/routes/") || !path.endsWith(".tsx")) return null;
  const relative = path.slice("src/routes/".length, -".tsx".length);
  const segments = relative.split(/[/.]/);
  if (segments.some(s => !ROUTE_SEGMENT.test(s) || BLOCKED.has(s) || s === "route")) return null;
  const index = segments.at(-1) === "index";
  const navigable = index ? segments.slice(0, -1) : segments;
  if (navigable.includes("index")) return null;
  return `/${navigable.join("/")}`;
}

function safePageContent(path: string, content: string): boolean {
  const url = tanstackPageUrl(path);
  if (url === null || !/\bcomponent\s*:/.test(content) || /\bserver\s*:\s*\{\s*handlers\s*:/.test(content)) return false;
  const declarations = Array.from(content.matchAll(ROUTE_DECLARATION));
  if (declarations.length !== 1) return false;
  const declared = declarations[0]?.[2];
  return declared === url || (url !== "/" && (path.endsWith("/index.tsx") || path.endsWith(".index.tsx")) &&
    declared === `${url}/`);
}

/** Accept only page components and ordinary, non-server presentation modules. */
export function isTanstackEditableSource(path: string, content: string): boolean {
  if (path === "src/styles.css") return true;
  if (!path.startsWith("src/") || path.includes("\\") || path.includes("//")) return false;
  if (path.startsWith("src/routes/")) return safePageContent(path, content);
  const parts = path.split("/");
  if (parts.length < 3 || !SOURCE_FOLDERS.has(parts[1]!)) return false;
  const basename = parts.at(-1)!;
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return false;
  const stem = basename.slice(0, dot), ext = basename.slice(dot + 1);
  if (!["ts", "tsx", "jsx", "css", "json"].includes(ext)) return false;
  if (ext === "json" && parts[1] !== "data") return false;
  return [...parts.slice(2, -1), stem].every(safeSegment);
}

/** New source files follow the same boundary as existing ones. */
export function isTanstackCreatableSource(path: string, content: string): boolean {
  return isTanstackEditableSource(path, content);
}
