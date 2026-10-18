/** Type-only resolution for stylesheets imported by the Next.js and shared IDE runtimes.
 * The stylesheet is still bundled by Next.js; this never changes runtime CSS behavior.
 */
declare module "*.css" {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
