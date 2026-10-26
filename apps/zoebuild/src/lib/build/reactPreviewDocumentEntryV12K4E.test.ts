import { expect, it } from "vitest";
import { PREVIEW_NAV_SCRIPT } from "./reactPreviewNavigationBridge";
import { runInNewContext } from "node:vm";
const ROOT = "/api/build/projects/cmva2y8l2000221dl6w20b5cm/preview/preview_0d5524f1-b9b1-4165-a986-b40db0de774a/content/hc0yaQh_mkTxk3nnFA5FYsnNzaZwDPmP/";
function simulate(route: string) {
  const doc = new URL(`https://zoe.test${ROOT}__zoebuild/document`);
  doc.searchParams.set("__zb_preview_route",route);
  doc.searchParams.set("__zb_preview_revision","7");
  let address=doc;
  const messages: Record<string,unknown>[]=[];
  const parent={postMessage:(d:Record<string,unknown>)=>messages.push(d)};
  const window={parent,addEventListener:()=>{},dispatchEvent:()=>{}};
  const script={getAttribute:(name:string)=>name==="src"?ROOT+"__zoebuild/navigation.js":name==="data-zoebuild-preview-root"?ROOT:null};
  const document={currentScript:script,querySelector:()=>script,getElementById:()=>({childElementCount:1}),documentElement:{}};
  const location={get href(){return address.href},get pathname(){return address.pathname},get search(){return address.search},get hash(){return address.hash}};
  const history={state:null,replaceState:(_value:unknown,_title:string,path:string)=>{address=new URL(path,address)},
    pushState:(_value:unknown,_title:string,path:string)=>{address=new URL(path,address)},back:()=>{},forward:()=>{}};
  runInNewContext(PREVIEW_NAV_SCRIPT,{document,location,window,history,URL,URLSearchParams,
    MutationObserver:class{observe(){}},setTimeout:()=>0,setInterval:()=>0,PopStateEvent:class{}},{timeout:2000});
  return {address,messages};
}
it("restores the root URL before the React app boots without a HEAD preflight",()=>{
  const {address,messages}=simulate("/");
  expect(address.pathname).toBe(ROOT);
  expect(messages).toContainEqual(expect.objectContaining({type:"bootstrap",status:"installed",revision:"7"}));
  expect(messages).toContainEqual(expect.objectContaining({type:"state",route:"/",revision:"7",rendered:true}));
});
it("restores /approach directly from the canonical document gateway",()=>{
  const {address,messages}=simulate("/approach?x=1#story");
  expect(address.pathname).toBe(ROOT+"approach");
  expect(messages).toContainEqual(expect.objectContaining({type:"state",route:"/approach?x=1#story",revision:"7"}));
});
