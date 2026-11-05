import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import type { RemoteWebPreviewRoute } from "@zoeskoul/learner-workspace/runner/remotePreview";

/**
 * Public navigation for saved TanStack Start file routes.
 *
 * This is only a navigation hint for the preview iframe, not an authorization
 * boundary or a router implementation. The live TanStack Router is authoritative.
 * Require a matching literal createFileRoute declaration and a page component.
 * Dynamic, pathless, API, internal and server-only routes are intentionally not
 * advertised; they remain reachable only under their own application rules.
 */
const MAX_PREVIEW_PAGES = 32;
const PUBLIC_SEGMENT = /^[a-z][a-z0-9-]{0,47}$/;
const ROUTE_DECLARATION = /\bcreateFileRoute\s*\(\s*(["'`])([^"'`\r\n]{1,256})\1\s*\)/g;

function routeForFile(path: string): { url: string; index: boolean } | null {
  if (!path.startsWith("src/routes/") || !path.endsWith(".tsx")) return null;
  const relative = path.slice("src/routes/".length, -".tsx".length);
  // A dot in a filename is a TanStack route segment separator. Pathless layout
  // folders and dynamic `$` params are not safe, literal navigation targets.
  const segments = relative.split(/[/.]/);
  // Do not advertise .server files or nested server-only route directories as pages.
  if (segments.includes("server")) return null;
  if (segments.some((segment) => !PUBLIC_SEGMENT.test(segment))) return null;
  const index = segments[segments.length - 1] === "index";
  const navigable = index ? segments.slice(0, -1) : segments;
  if (navigable.includes("index") || navigable.includes("route")) return null;
  if (!index && segments[segments.length - 1] === "route") return null;
  const url = `/${navigable.join("/")}`;
  if (url === "/api" || url.startsWith("/api/") || url.startsWith("/__")) return null;
  return { url, index };
}

function declaresPage(source: string, url: string, index: boolean): boolean {
  // Do not advertise endpoints that only define a server.handlers route.
  if (!/\bcomponent\s*:/.test(source)) return false;
  const declarations = Array.from(source.matchAll(ROUTE_DECLARATION));
  if (declarations.length !== 1) return false;
  const declared = declarations[0]?.[2];
  return declared === url || (index && url !== "/" && declared === `${url}/`);
}

function displayLabel(url: string): string {
  if (url === "/") return "Home";
  const slug = url.slice(url.lastIndexOf("/") + 1);
  return slug.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join(" ");
}

export function registeredTanstackPreviewRoutes(
  entries: readonly WorkspaceSyncEntry[],
): readonly RemoteWebPreviewRoute[] {
  const pages = new Map<string, RemoteWebPreviewRoute>();
  const seenFiles = new Set<string>();
  const ambiguous = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== "file" || !("content" in entry) || typeof entry.content !== "string") continue;
    const route = routeForFile(entry.path);
    if (!route) continue;
    // Duplicate file paths and route paths are ambiguous; never pick one.
    if (seenFiles.has(entry.path) || pages.has(route.url) || ambiguous.has(route.url)) {
      ambiguous.add(route.url);
      pages.delete(route.url);
      continue;
    }
    seenFiles.add(entry.path);
    if (!declaresPage(entry.content, route.url, route.index)) continue;
    pages.set(route.url, { path: route.url, label: displayLabel(route.url) });
  }
  return [...pages.values()]
    .sort((a, b) => a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path))
    .slice(0, MAX_PREVIEW_PAGES);
}
