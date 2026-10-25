import {describe,it,expect} from "vitest";
import {registeredReactPreviewRoutes} from "./reactPreviewPageCatalog";
import type {WorkspaceSyncEntry} from "@zoeskoul/code-contracts";
const file=(path:string,content:string):WorkspaceSyncEntry=>({kind:"file",path,content});
const base64:WorkspaceSyncEntry={kind:"file",path:"src/ZoePages.tsx",encoding:"base64",mimeType:"image/png",data:"not-source",sizeBytes:8};
const registry=`// @zoebuild-pages-v1
import Page0 from "./pages/approach";
import Page1 from "./pages/shop";
const pages = [
 {slug:"approach",label:"Our Approach",Component:Page0},
 {slug:"shop",label:"Shop",Component:Page1},
];`;
describe("saved React preview page catalog",()=>{
 it("shows actual registered pages without runner startup",()=>{
  expect(registeredReactPreviewRoutes([file("src/ZoePages.tsx",registry),file("src/pages/approach.tsx","export default function Approach(){}"),file("src/pages/shop.tsx","export default function Shop(){}")]))
   .toEqual([{path:"/",label:"Home"},{path:"/approach",label:"Our Approach"},{path:"/shop",label:"Shop"}]);
 });
 it("does not invent missing, unregistered, or credential file routes",()=>{
  expect(registeredReactPreviewRoutes([file("src/ZoePages.tsx",registry),file("src/pages/shop.tsx","x"),file("src/pages/secret.tsx","x")]))
   .toEqual([{path:"/",label:"Home"},{path:"/shop",label:"Shop"}]);
  expect(registeredReactPreviewRoutes([file("src/pages/shop.tsx","x")])).toEqual([{path:"/",label:"Home"}]);
  // WorkspaceSyncEntry also permits binary base64 files without a content property.
  expect(registeredReactPreviewRoutes([base64,file("src/pages/approach.tsx","x")]))
   .toEqual([{path:"/",label:"Home"}]);
 });
});
