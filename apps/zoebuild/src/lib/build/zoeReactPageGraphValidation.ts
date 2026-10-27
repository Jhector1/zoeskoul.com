/** Deterministic structural safeguards shared by Zoé and manual project saves.
 * These checks catch impossible module graphs. They do not replace Vite compilation.
 */
const PAGE = /^src\/pages\/([a-z][a-z0-9-]{0,47})\.tsx$/;
const ROUTER_MARKER = "// @zoebuild-react-router-v1";

export function invalidZoeReactPageSource(path: string, source: string): string | null {
  const match = PAGE.exec(path);
  if (!match) return null;
  const slug = match[1]!;
  if (source.includes(ROUTER_MARKER) || source.includes("// @zoebuild-pages-v1")) return `${path}: route registry belongs in src/ZoePages.tsx, not a page component.`;
  const selfImport = new RegExp(
    `(?:from\\s*|import\\s*\\()\\s*['\"](?:\\./)?(?:pages/)?${slug}(?:\\.tsx?)?['\"]`,"m");
  if (selfImport.test(source)) return `${path}: a React page cannot import itself.`;
  if (/(?:from\s*|import\s*\()\s*['"]\.\.\/(?:ZoePages|routes\/AppRoutes)(?:\.tsx?)?['"]/.test(source))
    return `${path}: a React page cannot import the parent route registry.`;
  return null;
}
