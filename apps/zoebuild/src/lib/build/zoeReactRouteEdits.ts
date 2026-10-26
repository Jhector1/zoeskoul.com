/**
 * V12K3: deterministic route wiring for already-authorized React/Vite projects.
 * The model writes page presentation; route imports, URLs and navigation are
 * controlled by ZoeBuild. This module makes NO provider or commerce changes.
 */
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { pathOf } from "@zoeskoul/learner-workspace/ide/fsTree";

const ROUTE = /^\/[a-z][a-z0-9-]{0,47}$/;
const SOURCE_PAGE = /^src\/pages\/([a-z][a-z0-9-]{0,47})\.tsx$/;
const RESERVED = new Set(["api", "assets", "sites", "admin", "billing", "auth", "favicon", "src", "__zoebuild"]);
export const ZOE_REACT_ROUTER_MARKER = "// @zoebuild-pages-v1";
export const ZOE_REACT_MAX_PAGES = 20;

export function isZoeReactPageRoute(route: unknown): route is string {
  return typeof route === "string" && ROUTE.test(route) && !RESERVED.has(route.slice(1));
}
export function isZoeReactPageSourcePath(path: unknown): path is string {
  return typeof path === "string" && SOURCE_PAGE.test(path) && !RESERVED.has(path.slice(10, -4));
}
export function pageSourcePath(route: string): string {
  if (!isZoeReactPageRoute(route)) throw new Error("BUILD_REACT_ROUTE_INVALID");
  return `src/pages/${route.slice(1)}.tsx`;
}
export function listReactPageSlugs(workspace: WorkspaceStateV2): string[] {
  return workspace.nodes.flatMap(node => node.kind === "file"
    ? [pathOf(workspace.nodes, node.id)] : [])
    .filter(isZoeReactPageSourcePath)
    .map(path => path.slice("src/pages/".length, -4))
    .sort();
}
function routeLabel(slug: string): string {
  return slug.split("-").map(word => word[0]!.toUpperCase() + word.slice(1)).join(" ");
}
/** Generate a small, dependency-free client route registry using the browser History API. */
export function renderZoeReactRouter(slugs: readonly string[]): string {
  const unique = [...new Set(slugs)].sort();
  if (unique.length > ZOE_REACT_MAX_PAGES || unique.some(slug => !isZoeReactPageRoute(`/${slug}`))) {
    throw new Error("BUILD_REACT_ROUTE_INVALID");
  }
  const imports = unique.map((slug, i) => `import Page${i} from "./pages/${slug}";`).join("\n");
  const records = unique.map((slug,i) => `  {slug:${JSON.stringify(slug)},label:${JSON.stringify(routeLabel(slug))},Component:Page${i}},`).join("\n");
  return String.raw`${ZOE_REACT_ROUTER_MARKER}
/// <reference types="vite/client" />
import {useEffect,useLayoutEffect,useState,type MouseEvent} from "react";
import App from "./App";
${imports}
const pages = [
${records}
];
function rootPath():string {
  const published = /^\/sites\/[^/]+(?=\/|$)/.exec(window.location.pathname)?.[0];
  return (published ?? import.meta.env.BASE_URL).replace(/\/+$/, "");
}
export default function ZoePages(){
  const [pathname,setPathname]=useState(()=>window.location.pathname);
  useEffect(()=>{
    const listener=()=>setPathname(window.location.pathname);
    window.addEventListener("popstate",listener);
    return ()=>window.removeEventListener("popstate",listener);
  },[]);
  // Relativize route URLs before paint: navigation must work even for middle-click,
  // new-tab, reload, and generated anchors that are inserted after hydration.
  const routeTarget=(href:string):string|null=>{
    if(!href.startsWith("/")||href.startsWith("//"))return null;
    const url=new URL(href,window.location.href);
    if(url.origin!==window.location.origin)return null;
    const root=rootPath();
    const relative=url.pathname===root?"":url.pathname.startsWith(root+"/")
      ?url.pathname.slice(root.length+1):url.pathname.slice(1);
    const slug=relative.replace(/\/+$/,"");
    if(slug!==""&&!pages.some(page=>page.slug===slug))return null;
    return root+"/"+slug+url.search+url.hash;
  };
  useLayoutEffect(()=>{
    const repairLinks=()=>{
      for(const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")){
        if(link.hasAttribute("download"))continue;
        const original=link.getAttribute("href");
        if(!original)continue;
        const routed=routeTarget(original);
        if(routed && original!==routed)link.setAttribute("href",routed);
      }
    };
    repairLinks();
    const observer=new MutationObserver(repairLinks);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["href"]});
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const onInternalLink=(event:globalThis.MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const target=event.target;
      if(!(target instanceof Element))return;
      const link=target.closest("a[href]");
      if(!link||link.hasAttribute("download")||
          (link.getAttribute("target")&&link.getAttribute("target")!=="_self"))return;
      const original=link.getAttribute("href");
      if(!original)return;
      const next=routeTarget(original);
      if(!next)return;
      event.preventDefault();
      if(window.location.pathname+window.location.search+window.location.hash!==next){
        window.history.pushState({},"",next);
        setPathname(window.location.pathname);
      }
    };
    document.addEventListener("click",onInternalLink,true);
    return ()=>document.removeEventListener("click",onInternalLink,true);
  },[]);
  const base=rootPath();
  const relative=pathname.startsWith(base+"/")
    ? pathname.slice(base.length+1).replace(/\/+$/,"")
    : pathname === base ? "" : null;
  const current=pages.find(item=>item.slug===relative);
  const destination=(slug:string)=>base+"/"+(slug||"");
  const visit=(event:MouseEvent<HTMLAnchorElement>,slug:string)=>{
    if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    const next=destination(slug);
    if(window.location.pathname!==next){window.history.pushState({},"",next);setPathname(next);}
  };
  return <>
    {relative===""?<App/>:current?<current.Component/>:<main><h1>Page not found</h1><a href={destination("")}>Home</a></main>}
  </>;
}
`;
}
/** Migrate only the canonical single-root React entry; refuse unknown bootstraps. */
export function wireZoeReactEntry(source: string): string {
  if (source.includes('from "./ZoePages"') && /<ZoePages\s*\/>/.test(source)) return source;
  if (!source.includes('import App from "./App";') || !/<App\s*\/>/.test(source)) {
    throw new Error("BUILD_REACT_ENTRY_UNSUPPORTED");
  }
  return source.replace('import App from "./App";', 'import ZoePages from "./ZoePages";')
    .replace(/<App\s*\/>/, "<ZoePages />");
}
