/**
 * Type declarations for stylesheet side-effect imports.
 *
 * Next.js and the bundler process CSS at build time.
 * These declarations allow TypeScript to recognize CSS imports
 * without disabling noUncheckedSideEffectImports.
 */
declare module "*.css" {}
