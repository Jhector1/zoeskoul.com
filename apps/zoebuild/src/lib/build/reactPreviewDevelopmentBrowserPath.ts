/** Exact public URL -> Runner relative path. Never pass a browser-controlled
 * absolute URL, private capability URL or double-encoded traversal. */
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const PREVIEW=/^preview_[0-9a-f-]{36}$/i;
const TOKEN=/^(?:dpv1\.[A-Za-z0-9_-]{32,1000}|dpg1\.[A-Za-z0-9_-]{43})$/;
const TANSTACK_DEV_CLIENT_ID="virtual:tanstack-start-dev-client-entry";
export function normalizeDevelopmentPreviewBrowserPath(
  url:URL,buildProjectId:string,previewId:string,token:string,
):string {
  if (!ID.test(buildProjectId)||!PREVIEW.test(previewId)||!TOKEN.test(token))
    throw new Error("Invalid preview URL.");
  const prefix=`/api/build/projects/${encodeURIComponent(buildProjectId)}/preview/${encodeURIComponent(previewId)}/development/content/${token}`;
  const tail=url.pathname===prefix?"":url.pathname.startsWith(prefix+"/")?url.pathname.slice(prefix.length+1):null;
  if(tail===null || tail.length>3900 || url.search.length>195 || url.hash ||
     /[\\\u0000-\u001f\u007f]/.test(tail))throw new Error("Invalid preview path.");
  for(const [index,part] of tail.split("/").entries()) {
    if(!part && (tail==="" || index===tail.split("/").length-1))continue;
    if(!part)throw new Error("Invalid preview path.");
    let decoded:string;
    try{decoded=decodeURIComponent(part);}catch{throw new Error("Invalid preview path.");}
    const viteVirtual=index===1 && tail.split("/")[0]==="@id" &&
      decoded===TANSTACK_DEV_CLIENT_ID;
    if(!decoded || decoded==="." || decoded===".." || decoded.includes("%") ||
      decoded.includes(":") && !viteVirtual || /[\/\\\u0000-\u001f\u007f]/.test(decoded) || decoded.toLowerCase()==="@fs")
      throw new Error("Invalid preview path.");
  }
  return tail+restoreViteCssUrlFlags(tail,url.search);
}

/** Next.js can serialize the bare Vite flags as empty-valued parameters.
 * Restore only the observed CSS URL-import flags. Preserve all other raw
 * query components (including values, encoding, and order) verbatim.
 * This runs after public path validation; it grants no additional paths. */
function restoreViteCssUrlFlags(tail:string,search:string):string {
  if(!tail.endsWith(".css") || !search) return search;
  const parts=search.slice(1).split("&");
  if(!parts.some(part=>part==="url" || part==="url=")) return search;
  return "?"+parts.map(part=>part==="url="?"url":part==="import="?"import":part).join("&");
}
