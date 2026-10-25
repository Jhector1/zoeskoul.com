import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import type { RemoteWebPreviewRoute } from "@zoeskoul/learner-workspace/runner/remotePreview";

/** Only routes referenced by the saved canonical registry and real page files.
 * This list is available even if the Vite runner is temporarily unavailable.
 */
export function registeredReactPreviewRoutes(entries: readonly WorkspaceSyncEntry[]): readonly RemoteWebPreviewRoute[] {
  const files = new Map<string,string>();
  for (const entry of entries) {
    if (entry.kind !== "file" || !("content" in entry) || typeof entry.content !== "string") continue;
    files.set(entry.path, entry.content);
  }
  const result: RemoteWebPreviewRoute[] = [{path:"/", label:"Home"}];
  const registry = files.get("src/ZoePages.tsx");
  if (!registry || !registry.includes("// @zoebuild-pages-v1")) return result;
  const imported = new Map<string,string>();
  for (const match of registry.matchAll(/import\s+Page(\d+)\s+from\s+["']\.\/pages\/([a-z][a-z0-9-]{0,47})["']/g)) {
    imported.set(match[1]!,match[2]!);
  }
  const seen = new Set<string>();
  for (const match of registry.matchAll(/\{slug:["']([a-z][a-z0-9-]{0,47})["'],label:["']([^"'\n]{1,80})["'],Component:Page(\d+)\}/g)) {
    const slug = match[1]!;
    if (seen.has(slug) || imported.get(match[3]!) !== slug || !files.has(`src/pages/${slug}.tsx`)) continue;
    seen.add(slug);
    result.push({path:`/${slug}`,label:match[2]!});
    if (result.length >= 32) break;
  }
  return result;
}
