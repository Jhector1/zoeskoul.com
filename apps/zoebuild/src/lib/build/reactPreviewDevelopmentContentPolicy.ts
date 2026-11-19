import { injectNativeIframeHmrBootstrap } from "./reactPreviewDevelopmentNativeIframeHmr";
/** Phase 4E2B2 public read boundary. No source files, private Vite base paths,
 * Runner credentials or editor cookies may cross this boundary. */
export const DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER = "/__zoebuild_dev_preview_public_base__/";
// Fail closed for either representation, including a capability prefix with
// an unexpected suffix. Public development grants use a different namespace.
const PRIVATE_VITE_BASE = /\/api\/build\/projects\/[A-Za-z0-9_-]+\/preview\/preview_[a-f0-9-]+\/content\/[A-Za-z0-9_-]{32}/i;
const TEXT_MEDIA = /^(?:text\/(?:html|css|javascript|plain)|application\/(?:javascript|x-javascript|json)|text\/x-typescript)(?:\s*;|$)/i;
const HTML = /^text\/html(?:\s*;|$)/i;
const MIME = /^(?:text\/(?:html|css|javascript|plain)|application\/(?:javascript|x-javascript|json|wasm|octet-stream)|image\/(?:png|jpe?g|gif|svg\+xml|webp|avif)|font\/(?:woff2?|ttf|otf)|audio\/(?:mpeg|ogg|wav)|video\/(?:mp4|webm))(?:\s*;|$)/i;

export function publicDevelopmentPreviewBasePath(
  buildProjectId:string,previewId:string,token:string,
):string {
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(buildProjectId) ||
     !/^preview_[0-9a-f-]{36}$/i.test(previewId) ||
     !/^(?:dpv1\.[A-Za-z0-9_-]{32,1000}|dpg1\.[A-Za-z0-9_-]{43})$/.test(token)) throw new Error("Invalid preview public URL.");
  return `/api/build/projects/${encodeURIComponent(buildProjectId)}/preview/${encodeURIComponent(previewId)}/development/content/${token}/`;
}

/** Strict content-type and size policy. Never forward content-controlled
 * response headers, cache directives, cookies, redirect URLs or source maps.
 * Leave JavaScript/CSS intact except for exact inert-base substitution. */
export function prepareDevelopmentPreviewBrowserResponse(input:Readonly<{
  status:number;headers:Readonly<Record<string,string>>;bodyBase64:string;
}>, publicBase:string,method:"GET"|"HEAD",nativeIframeHmr=false):Response {
  const type=input.headers["content-type"]??"";
  if (!MIME.test(type) || !Number.isInteger(input.status) || input.status < 200 || input.status > 599 ||
      (input.status >= 300 && input.status < 400) ||
      typeof input.bodyBase64!=="string" || input.bodyBase64.length>8_400_000)
    throw new Error("Untrusted preview content.");
  let bytes=Buffer.from(input.bodyBase64,"base64");
  if (bytes.length>6*1024*1024 || bytes.toString("base64")!==input.bodyBase64)
    throw new Error("Untrusted preview content.");
  if (TEXT_MEDIA.test(type) && method==="GET") {
    const original=bytes.toString("utf8");
    // Reject an unredacted private base rather than leaking a Runner capability.
    if (PRIVATE_VITE_BASE.test(original)) throw new Error("Private preview base leaked.");
    // Replace the stem so the router base remains slashless, while imports
    // and document links retain the slash already present in the response.
    const changed=original.split(DEVELOPMENT_PREVIEW_PUBLIC_BASE_MARKER.slice(0,-1))
      .join(publicBase.replace(/\/$/, ""));
    const document=HTML.test(type) && nativeIframeHmr ? injectNativeIframeHmrBootstrap(changed,
      process.env.ZOEBUILD_DEVELOPMENT_APPLICATION_RPC_ENABLED === "true" &&
      process.env.NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_APPLICATION_RPC_ENABLED === "true" ? publicBase : undefined) : changed;
    bytes=Buffer.from(document,"utf8");
    if(bytes.length>6*1024*1024)throw new Error("Preview content too large.");
  }
  const headers=new Headers({
    "Content-Type":type,
    "Cache-Control":"private, no-store, max-age=0",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"no-referrer",
    "Access-Control-Allow-Origin":"*",
    "Cross-Origin-Resource-Policy":"cross-origin",
    "X-Frame-Options":"SAMEORIGIN",
  });
  if (HTML.test(type)) {
    // The document always runs with an opaque origin; no editor session or
    // form uploads. The embedding iframe MUST ALSO omit allow-same-origin.
    headers.set("Content-Security-Policy",
      "sandbox allow-scripts; default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
  }
  return new Response(method==="HEAD"?null:new Uint8Array(bytes),{status:input.status,headers});
}
