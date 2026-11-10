/** Skip non-project artifacts while retaining real source files and README files.
 * This is only a browser-side filter. The Runner independently enforces paths.
 */
const IGNORED_IMPORT_PARTS = new Set([
  ".git", ".svn", ".hg", "node_modules", ".next", "__pycache__",
  ".venv", "venv", ".idea", ".DS_Store", "Thumbs.db", ".pytest_cache",
  ".mypy_cache", ".ruff_cache", ".turbo", ".cache", "dist", "build",
]);
export function shouldSkipV6FolderImportPath(path: string): boolean {
  return path.split("/").some(part => IGNORED_IMPORT_PARTS.has(part) ||
    part === ".env" || part.startsWith(".env.") ||
    part.startsWith(".zoe-v6-") || part === ".zoeskoul");
}
