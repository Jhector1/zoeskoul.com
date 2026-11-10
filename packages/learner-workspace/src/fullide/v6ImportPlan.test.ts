import {describe,it,expect} from "vitest";
import {planV6Import} from "./v6ImportPlan";
const limits={maxFiles:5,maxDepth:6,maxTextBytes:4096,maxBinaryBytes:4096};
describe("V6 absent-only import preflight",()=>{
 it("creates nested directories in parent-first order",()=>{
  const plan=planV6Import([{path:"assets/docs/readme.txt",content:"Hello"}],[],limits);
  expect(plan.directories).toEqual(["assets","assets/docs"]);
  expect(plan.entries).toEqual([{kind:"file",path:"assets/docs/readme.txt",content:"Hello"}]);
 });
 it("refuses existing file instead of overwriting",()=>{
  expect(()=>planV6Import([{path:"notes.txt",content:"new"}],[{kind:"file",path:"notes.txt",content:"old"}],limits)).toThrow();
 });
 it("rejects duplicate paths in a batch",()=>{
  expect(()=>planV6Import([{path:"a.txt",content:"a"},{path:"a.txt",content:"b"}],[],limits)).toThrow();
 });
 it("refuses file-ancestor collisions",()=>{
  expect(()=>planV6Import([{path:"src/a.txt",content:"a"}],[{kind:"file",path:"src",content:"old"}],limits)).toThrow();
 });
 it("rejects traversal and internal paths",()=>{
  expect(()=>planV6Import([{path:"../secret.txt",content:"a"}],[],limits)).toThrow();
  expect(()=>planV6Import([{path:".git/config",content:"a"}],[],limits)).toThrow();
 });
 it("rejects an imported file that collides with an imported directory",()=>{
  expect(()=>planV6Import([{path:"pkg/note.txt",content:"a"},{path:"pkg",content:"b"}],[],limits)).toThrow();
 });
 it("imports a second non-overlapping folder against the updated Runner snapshot",()=>{
  const first=planV6Import([{path:"first/a.txt",content:"one"}],[],limits);
  const updated=[{kind:"directory" as const,path:"first"},...first.entries];
  const second=planV6Import([{path:"second/deep/b.txt",content:"two"}],updated,limits);
  expect(second.directories).toEqual(["second","second/deep"]);
  expect(second.entries).toEqual([{kind:"file",path:"second/deep/b.txt",content:"two"}]);
  expect(()=>planV6Import([{path:"first/a.txt",content:"replace"}],updated,limits)).toThrow();
 });
 it("enforces upload size and depth",()=>{
  expect(()=>planV6Import([{path:"a.txt",content:"😀"}],[],{...limits,maxTextBytes:3})).toThrow();
  expect(()=>planV6Import([{path:"a/b/c.txt",content:"a"}],[],{...limits,maxDepth:2})).toThrow();
 });
});
