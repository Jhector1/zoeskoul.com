import {describe,it,expect} from "vitest";
import {invalidZoeReactPageSource} from "./zoeReactPageGraphValidation";
import {parseBuildWorkspaceMutation,BuildWorkspaceMutationError} from "./buildWorkspaceMutation";
const file=(id:string,name:string,parentId:string|null,content:string)=>({id,kind:"file",name,parentId,content,createdAt:1,updatedAt:1});
const folder=(id:string,name:string,parentId:string|null)=>({id,kind:"folder",name,parentId,createdAt:1,updatedAt:1});
const base={version:2,language:"web",leftPct:26,stdin:"",expanded:["src"],openTabs:["page"],entryFileId:"page",activeFileId:"page"};
const ws=(page:string)=>({...base,nodes:[folder("src","src",null),folder("pages","pages","src"),
 file("page","approach.tsx","pages",page)]});
describe("React route import graph safeguards",()=>{
 it("rejects router pasted into a page through the manual source-save parser",()=>{
   expect(()=>parseBuildWorkspaceMutation(ws('// @zoebuild-pages-v1\nexport default function Approach(){return null}')))
     .toThrow(BuildWorkspaceMutationError);
 });
 it("rejects self-imports and route registry imports",()=>{
   for(const src of ['import Page0 from "./pages/approach";','import App from "../ZoePages";',
    'const x=import("./approach.tsx");']){
     expect(invalidZoeReactPageSource("src/pages/approach.tsx",src)).toBeTruthy();
   }
 });
 it("does not block valid React page content or unrelated files",()=>{
   const valid='export default function Approach(){return <main>Approach</main>}';
   expect(invalidZoeReactPageSource("src/pages/approach.tsx",valid)).toBe(null);
   expect(invalidZoeReactPageSource("src/ZoePages.tsx","// @zoebuild-pages-v1")).toBe(null);
 });
});
