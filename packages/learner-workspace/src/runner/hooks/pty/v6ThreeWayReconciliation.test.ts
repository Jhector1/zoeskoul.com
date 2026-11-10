import {describe, expect, it} from "vitest";
import type {WorkspaceSyncEntry} from "@zoeskoul/learner-workspace/runner/runtime";
import {planV6ThreeWayReconciliation as plan} from "./v6ThreeWayReconciliation";
const f=(path:string,content:string):WorkspaceSyncEntry=>({kind:"file",path,content});
describe("V6 three-way reconciliation safety",()=>{
 it("refuses to infer an ancestor from the browser draft",()=>{
   const p=plan({ancestor:null,browser:[f("a.txt","local")],runner:[f("a.txt","remote")]});
   expect(p.safe).toBe(false);expect(p.paths[0].kind).toBe("unverified");
 });
 it("recognizes runner-only edits without overwriting local work",()=>{
   const p=plan({ancestor:[f("a.txt","old")],browser:[f("a.txt","old")],runner:[f("a.txt","new")]});
   expect(p.safe).toBe(true);expect(p.paths[0].kind).toBe("runner_only");
 });
 it("recognizes browser-only edits",()=>{
   const p=plan({ancestor:[f("a.txt","old")],browser:[f("a.txt","new")],runner:[f("a.txt","old")]});
   expect(p.paths[0].kind).toBe("browser_only");
 });
 it("blocks simultaneous divergent edits",()=>{
   const p=plan({ancestor:[f("a.txt","old")],browser:[f("a.txt","mine")],runner:[f("a.txt","theirs")]});
   expect(p.safe).toBe(false);expect(p.paths[0].kind).toBe("conflict");
 });
 it("detects delete-versus-edit conflict",()=>{
   const p=plan({ancestor:[f("a.txt","old")],browser:[],runner:[f("a.txt","new")]});
   expect(p.safe).toBe(false);expect(p.paths[0].kind).toBe("conflict");
 });
 it("does not invent conflicts when both sides already match",()=>{
   const p=plan({ancestor:null,browser:[f("a.txt","same")],runner:[f("a.txt","same")]});
   expect(p.safe).toBe(true);expect(p.paths[0].kind).toBe("unchanged");
 });
 it("keeps disjoint path changes distinguishable",()=>{
   const p=plan({ancestor:[f("a","1"),f("b","1")],browser:[f("a","2"),f("b","1")],runner:[f("a","1"),f("b","3")]});
   expect(p.safe).toBe(true);expect(p.paths.map(x=>x.kind)).toEqual(["browser_only","runner_only"]);
 });
 it("excludes internal control-plane files",()=>{
   const p=plan({ancestor:null,browser:[f(".bash_history","local")],runner:[f(".bash_history","remote")]});
   expect(p.paths).toHaveLength(0);
 });
});
