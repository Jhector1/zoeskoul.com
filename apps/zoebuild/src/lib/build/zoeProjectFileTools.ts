import { createHash } from "node:crypto";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";

/**
 * V12K10: snapshot-scoped, read-only project-file tools for a future metered Zoé agent loop.
 *
 * A project is NOT truncated to a fixed aggregate character/file count. Every eligible
 * path remains discoverable. Each tool response is paged/chunked so the selected AI model
 * never needs to receive the whole repository in a single prompt.
 *
 * An authenticated owner-authorized workspace must be supplied by the server. Do not
 * accept a workspace, arbitrary filesystem path or permission claim from model output.
 * The existing canonical source-edit validator is exclusively responsible for writes.
 */

export type ZoeProjectFileEntry = Readonly<{
  path: string;
  characters: number;
  sha256: string;
  imports: readonly string[];
}>;
export type ZoeFilePage = Readonly<{
  total: number;
  offset: number;
  entries: readonly ZoeProjectFileEntry[];
  nextOffset: number | null;
}>;
export type ZoeFileRead = Readonly<{
  path: string;
  sha256: string;
  totalCharacters: number;
  offset: number;
  content: string;
  nextOffset: number | null;
}>;
export type ZoeFileSearchHit = Readonly<{
  path: string;
  offset: number;
  excerpt: string;
}>;
export type ZoeFileSearchPage = Readonly<{
  hits: readonly ZoeFileSearchHit[];
  nextOffset: number | null;
  scannedFiles: number;
}>;

const TEXT_SOURCE = /\.(?:tsx?|jsx?|mjs|cjs|css|scss|html?|json|md|mdx|ya?ml|svg|txt)$/i;
const PROTECTED_SEGMENT = /^(?:\.git|\.next|node_modules|dist|build|coverage|vendor|\.turbo|__generated__|secrets?)$/i;
const PROTECTED_BASENAME = /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.gitignore|[^/]*\.(?:key|pem|p12|pfx)|[^/]*\.lock)$/i;
// Reject an entire file when it looks like it may contain credentials, rather than
// replacing secret substrings and accidentally delivering enough surrounding material.
const SECRET_MATERIAL = /-----BEGIN [^-\r\n]*PRIVATE KEY-----|(?:sk[_-](?:live|test|proj)[_-]|ghp_|github_pat_|xox[baprs]-|AIza)[A-Za-z0-9_-]{12,}/;
const IMPORT_SPECIFIER = /\b(?:from\s*|import\s*(?:\(\s*)?)["']([^"'\r\n]{1,240})["']/g;
const MAX_LIST_PAGE = 100;
const MAX_READ_CHUNK = 24_000;
const MAX_SEARCH_PAGE = 40;
const MAX_QUERY = 120;

function safePath(path: string): boolean {
  return path.length > 0 && path.length <= 1024 && !path.startsWith("/") &&
    !path.includes("\\") && !path.includes("//") && !path.includes("\0") &&
    path.split("/").every(p => p.length > 0 && p !== "." && p !== ".." && !p.startsWith(".") &&
      !PROTECTED_SEGMENT.test(p)) && TEXT_SOURCE.test(path) && !PROTECTED_BASENAME.test(path);
}
function normalizedOffset(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new ZoeProjectFileToolError("INVALID_OFFSET");
  return value;
}
function boundedPage(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new ZoeProjectFileToolError("INVALID_PAGE_SIZE");
  }
  return value;
}
function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function sourceImports(source: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(IMPORT_SPECIFIER.source, "g");
  let found: RegExpExecArray | null;
  while ((found = pattern.exec(source)) && out.length < 200) {
    if (!out.includes(found[1]!)) out.push(found[1]!);
  }
  return out;
}

export class ZoeProjectFileToolError extends Error {
  constructor(readonly code: "INVALID_OFFSET" | "INVALID_PAGE_SIZE" | "INVALID_PATH" | "INVALID_QUERY") {
    super(`Project source inspection rejected: ${code}`);
    this.name = "ZoeProjectFileToolError";
  }
}

export function createZoeProjectFileTools(workspace: WorkspaceStateV2) {
  // Build parent references once. Calling pathOf() for every file repeatedly
  // traverses the full node list and becomes quadratic in large projects.
  const byId = new Map(workspace.nodes.map(node => [node.id, node] as const));
  const resolvedPaths = new Map<string, string | null>();
  const active = new Set<string>();
  function resolveNodePath(id: string): string | null {
    if (resolvedPaths.has(id)) return resolvedPaths.get(id)!;
    const node = byId.get(id);
    if (!node || active.has(id)) return null;
    active.add(id);
    const parent = node.parentId ? resolveNodePath(node.parentId) : "";
    active.delete(id);
    const path = parent === null || !node.name || /[/\\\0]/.test(node.name)
      ? null : parent ? `${parent}/${node.name}` : node.name;
    resolvedPaths.set(id, path);
    return path;
  }
  const contents = new Map<string, string>();
  for (const node of workspace.nodes) {
    if (node.kind !== "file" || node.binary || typeof node.content !== "string") continue;
    const path = resolveNodePath(node.id);
    if (!path || !safePath(path) || SECRET_MATERIAL.test(node.content)) continue;
    if (contents.has(path)) throw new ZoeProjectFileToolError("INVALID_PATH");
    contents.set(path, node.content);
  }
  const entries: ZoeProjectFileEntry[] = [...contents.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => ({path, characters: content.length, sha256: sha256(content), imports: sourceImports(content)}));

  return {
    count: entries.length,
    // Path listing is paginated, not truncated. Call again with nextOffset.
    list(options: {offset?: number; limit?: number; prefix?: string} = {}): ZoeFilePage {
      const offset = normalizedOffset(options.offset ?? 0);
      const limit = boundedPage(options.limit ?? 60, MAX_LIST_PAGE);
      const prefix = options.prefix ?? "";
      if (typeof prefix !== "string" || prefix.length > 1024 || prefix.includes("..") || prefix.includes("\\")) {
        throw new ZoeProjectFileToolError("INVALID_PATH");
      }
      const matching = prefix ? entries.filter(entry => entry.path.startsWith(prefix)) : entries;
      const slice = matching.slice(offset, offset + limit);
      return {total: matching.length, offset, entries: slice,
        nextOffset: offset + slice.length < matching.length ? offset + slice.length : null};
    },
    // Long files can be read completely over consecutive calls. Never silently truncate.
    read(path: string, options: {offset?: number; length?: number} = {}): ZoeFileRead {
      if (typeof path !== "string" || !safePath(path) || !contents.has(path)) {
        throw new ZoeProjectFileToolError("INVALID_PATH");
      }
      const offset = normalizedOffset(options.offset ?? 0);
      const length = boundedPage(options.length ?? 12_000, MAX_READ_CHUNK);
      const content = contents.get(path)!;
      if (offset > content.length) throw new ZoeProjectFileToolError("INVALID_OFFSET");
      const excerpt = content.slice(offset, offset + length);
      return {path, sha256: sha256(content), totalCharacters: content.length, offset, content: excerpt,
        nextOffset: offset + excerpt.length < content.length ? offset + excerpt.length : null};
    },
    // Literal source search is a deterministic tool, not a keyword-based intent gate.
    search(query: string, options: {offset?: number; limit?: number; prefix?: string} = {}): ZoeFileSearchPage {
      if (typeof query !== "string" || !query.trim() || query.length > MAX_QUERY || /[\0\r\n]/.test(query)) {
        throw new ZoeProjectFileToolError("INVALID_QUERY");
      }
      const offset = normalizedOffset(options.offset ?? 0);
      const limit = boundedPage(options.limit ?? 20, MAX_SEARCH_PAGE);
      const prefix = options.prefix ?? "";
      if (typeof prefix !== "string" || prefix.length > 1024 || prefix.includes("..") || prefix.includes("\\")) {
        throw new ZoeProjectFileToolError("INVALID_PATH");
      }
      const matchingEntries = prefix ? entries.filter(item => item.path.startsWith(prefix)) : entries;
      const hits: ZoeFileSearchHit[] = [];
      let index = offset;
      for (; index < matchingEntries.length && hits.length < limit; index++) {
        const file = matchingEntries[index]!;
        const content = contents.get(file.path)!;
        const match = content.toLowerCase().indexOf(query.toLowerCase());
        if (match < 0) continue;
        hits.push({path:file.path,offset:match,excerpt:content.slice(Math.max(0,match - 100),match + query.length + 100)});
      }
      return {hits,scannedFiles:index - offset,nextOffset:index < matchingEntries.length ? index : null};
    },
  };
}
