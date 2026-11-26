/** Next.js can serialize the bare Vite flags as empty-valued parameters.
 * Restore only the observed CSS URL-import flags. Preserve all other raw
 * query components (including values, encoding, and order) verbatim.
 * This runs after public path validation; it grants no additional paths. */
export function restoreViteCssUrlFlags(tail:string,search:string):string {
  if(!tail.endsWith(".css") || !search) return search;
  const parts=search.slice(1).split("&");
  if(!parts.some(part=>part==="url" || part==="url=")) return search;
  return "?"+parts.map(part=>part==="url="?"url":part==="import="?"import":part).join("&");
}
