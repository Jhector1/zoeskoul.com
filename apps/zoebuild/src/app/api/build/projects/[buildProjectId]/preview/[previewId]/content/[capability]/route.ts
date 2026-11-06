/**
 * Next App Router's required catch-all `[...path]` route cannot match the
 * bare capability URL. TanStack home navigation and hard refresh can request
 * exactly that URL, with or without a trailing slash.
 *
 * Delegate to the existing capability proxy instead of duplicating its
 * ownership checks, runner admission, SSR bridge, or response policies.
 * No write methods are exposed from the root route.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { GET, HEAD } from "./[...path]/route";
