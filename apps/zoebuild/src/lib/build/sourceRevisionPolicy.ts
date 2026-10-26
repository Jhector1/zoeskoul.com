/** Pure source-history contract. No database operations or network requests. */
export type RevisionRestoreRequest = Readonly<{baseVersion: number; restoreVersion: number}>;

export function parseRevisionRestoreRequest(value: unknown): RevisionRestoreRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !Object.hasOwn(record, "baseVersion") || !Object.hasOwn(record, "restoreVersion")) return null;
  if (!Number.isSafeInteger(record.baseVersion) || !Number.isSafeInteger(record.restoreVersion)) return null;
  const baseVersion = record.baseVersion as number;
  const restoreVersion = record.restoreVersion as number;
  if (baseVersion < 1 || restoreVersion < 1 || restoreVersion >= baseVersion) return null;
  return {baseVersion, restoreVersion};
}

export type RevisionPreviewFile = Readonly<{
  path: string;
  content: string;
  truncated: boolean;
}>;

/** Return a bounded *read-only* preview; no binary content or credentials.
 * Workspace FSNode.binary is structured BinaryFileContent (not a boolean).
 * Keep the input broad enough for typed workspace nodes and fail closed on
 * any truthy binary marker; never emit its content.
 */
export function buildRevisionFilePreview(
  workspace: {nodes: readonly {id: string; parentId?: string | null; name: string; kind: string; binary?: unknown; content?: string}[]},
): {files: RevisionPreviewFile[]; omitted: number} {
  const byId = new Map(workspace.nodes.map(node => [node.id, node]));
  const files: RevisionPreviewFile[] = [];
  let remaining = 96_000;
  let omitted = 0;
  const SECRET = /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk-proj-|sk_live_|sk_test_|ghp_|xox[baprs]-)[A-Za-z0-9_-]{12,}/;
  for (const node of workspace.nodes) {
    if (node.kind !== "file" || node.binary || typeof node.content !== "string") continue;
    const pathParts: string[] = [];
    const seen = new Set<string>();
    let cursor: typeof node | undefined = node;
    while (cursor) {
      if (seen.has(cursor.id) || pathParts.length > 20) {pathParts.length = 0; break;}
      seen.add(cursor.id);
      pathParts.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    const path = pathParts.join("/");
    if (!/^src\/(?:App\.(?:tsx|jsx)|main\.(?:tsx|jsx)|pages\/[A-Za-z0-9_\/-]+\.(?:tsx|jsx)|components\/[A-Za-z0-9_\/-]+\.(?:tsx|jsx|css)|[A-Za-z0-9_-]+\.css)$/.test(path) ||
       path.includes("..") || SECRET.test(node.content)) {omitted++; continue;}
    if (files.length >= 50 || remaining < 100) {omitted++; continue;}
    const preview = node.content.slice(0, Math.min(6_000, remaining));
    files.push({path, content: preview, truncated: preview.length < node.content.length});
    remaining -= preview.length;
  }
  return {files, omitted};
}
