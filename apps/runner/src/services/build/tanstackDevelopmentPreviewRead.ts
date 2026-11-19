import { sharedFullStackPreviews, type SharedFullStackPreviewRegistry } from "./sharedPreviewRegistry.js";
import { fetchTanstackHttpInsideSandbox } from "./tanstackPreviewDockerTransport.js";
import { normalizeTanstackPreviewHttpRequest, TANSTACK_JSON_GET_RPC, type TanstackJsonGetRpc } from "./tanstackPreviewHttpBoundary.js";
import { tanstackInternalPreviewPath } from "./tanstackPreviewRuntimePolicy.js";

/** Only a relative Vite path may cross the ZoeBuild-to-Runner boundary.
 * The actual Vite capability base is looked up from the owned lease INSIDE
 * the Runner and must never be sent to a browser, or relied upon by ZoeBuild.
 * Reject encoded separators, traversal, double decoding and absolute URLs.
 */
export function normalizeDevelopmentPreviewRelativePath(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096 ||
      value.startsWith("/") || value.includes("#") ||
      /[\\\u0000-\u001f\u007f]/.test(value))
    throw new Error("Invalid development preview relative path.");
  const pathname = value.split("?", 1)[0];
  const parts = pathname.split("/");
  for (const [index, part] of parts.entries()) {
    if (part === "" && (pathname === "" || index === parts.length - 1)) continue;
    if (!part) throw new Error("Invalid development preview relative path.");
    let decoded: string;
    try { decoded = decodeURIComponent(part); }
    catch { throw new Error("Invalid development preview relative path."); }
    const viteVirtual = index === 1 && parts[0] === "@id" &&
      decoded === "virtual:tanstack-start-dev-client-entry";
    if (!decoded || decoded === "." || decoded === ".." ||
        decoded.includes("%") || decoded.includes(":") && !viteVirtual ||
        /[\/\\\u0000-\u001f\u007f]/.test(decoded) ||
        decoded.toLowerCase() === "@fs")
      throw new Error("Invalid development preview relative path.");
  }
  return value;
}

/** Phase 4E2: private, read-only development transport. Unlike the immutable
 * preview capability endpoint this requires the authenticated Runner actor and
 * the exact current project revision. It must NEVER be called with a public
 * preview bearer identity. No WebSocket or public browser route is enabled.
 */
/** The service read response uses this inert marker rather than revealing the
 * Runner-minted Vite base capability to ZoeBuild or any browser. */
export const DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER = "/__zoebuild_dev_preview_public_base__/";

export function redactDevelopmentPreviewBasePath(
  response: Readonly<{status:number;headers:Readonly<Record<string,string>>;bodyBase64:string;timing?:unknown}>,
  internalBasePath: string,
) {
  const contentType=response.headers["content-type"] ?? "";
  // Never decode or transform binary, compressed, or unknown media. All
  // transformed bodies are already bounded by the Docker HTTP boundary.
  if (!/^(?:text\/(?:html|css|javascript|plain)|application\/(?:javascript|x-javascript|json)|text\/x-typescript)(?:\s*;|$)/i.test(contentType))
    return response;
  const body=Buffer.from(response.bodyBase64,"base64");
  const original=body.toString("utf8");
  // Redact the exact capability stem, not only its slash-terminated form.
  // TanStack embeds a slashless basepath in transformed router modules.
  // Keep the original suffix (including a slash, query or fragment) verbatim.
  if (!internalBasePath.endsWith("/") || internalBasePath.length <= 1)
    throw new Error("Invalid development preview base.");
  const privateStem=internalBasePath.slice(0,-1);
  if (!original.includes(privateStem)) return response;
  const rewritten=original.split(privateStem).join(DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER.slice(0,-1));
  return {...response,bodyBase64:Buffer.from(rewritten,"utf8").toString("base64")};
}

export async function readOwnedTanstackDevelopmentPreview(input: Readonly<{
  ownerKey: string;
  previewId: string;
  buildProjectId: string;
  sourceVersion: number;
  path: string;
  method: "GET" | "HEAD";
  accept: "*/*" | "text/css";
  applicationRpc?: TanstackJsonGetRpc;
}>, deps: Readonly<{
  registry: Pick<SharedFullStackPreviewRegistry,
    "assertDevelopmentReadOpen" | "touch">;
  transport: typeof fetchTanstackHttpInsideSandbox;
}> = {
  registry: sharedFullStackPreviews,
  transport: fetchTanstackHttpInsideSandbox,
}) {
  if (input.method !== "GET" && input.method !== "HEAD")
    throw new Error("Method not allowed.");
  if (input.accept !== "*/*" && input.accept !== "text/css")
    throw new Error("Invalid preview Accept preference.");
  const identity = {
    previewId:input.previewId, ownerKey:input.ownerKey,
    buildProjectId:input.buildProjectId, sourceVersion:input.sourceVersion,
  };
  const relativePath = normalizeDevelopmentPreviewRelativePath(input.path);
  const first = decodeURIComponent(relativePath.split("?",1)[0]!.split("/",1)[0]!);
  if (input.applicationRpc === undefined && first.toLowerCase() === "_serverfn")
    throw new Error("Preview RPC requires separate authorization.");
  if (input.applicationRpc !== undefined && input.applicationRpc !== TANSTACK_JSON_GET_RPC)
    throw new Error("Invalid preview RPC protocol.");
  const before = deps.registry.assertDevelopmentReadOpen(identity);
  const safe = normalizeTanstackPreviewHttpRequest({
    basePath: before.basePath,
    path: before.basePath + relativePath, method: input.method,
    headers: {accept:input.accept}, applicationRpc:input.applicationRpc,
  });
  const internalPath = tanstackInternalPreviewPath(before.basePath,safe);
  const response = await deps.transport(before.containerId, {...safe,path:internalPath});
  // A request started before an edit must not expose a response if the edit
  // completed, is still pending, or a close began while Docker was reading.
  const after = deps.registry.assertDevelopmentReadOpen(identity);
  if (after.containerId !== before.containerId ||
      after.basePath !== before.basePath ||
      after.identity.fingerprint !== before.identity.fingerprint)
    throw new Error("Preview not found.");
  if (input.applicationRpc === TANSTACK_JSON_GET_RPC) {
    // Reject capability-bearing JSON, rather than silently altering Seroval
    // records. Check parsed strings (including escaped strings) as well as bytes.
    const text = Buffer.from(response.bodyBase64,"base64").toString("utf8");
    const token = before.basePath.split("/").at(-2)!;
    const canonical = JSON.stringify(JSON.parse(text));
    if (text.includes(token) || canonical.includes(token) ||
        text.includes(DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER.slice(0,-1)) ||
        canonical.includes(DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER.slice(0,-1)))
      throw new Error("Unsafe preview RPC response.");
    deps.registry.touch(input.previewId,Date.now());
    return {sourceVersion:after.sourceVersion,response};
  }
  deps.registry.touch(input.previewId,Date.now());
  return {sourceVersion:after.sourceVersion,response:redactDevelopmentPreviewBasePath(response,before.basePath)};
}
