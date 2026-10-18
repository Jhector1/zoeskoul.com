import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(p:string)=>readFileSync(resolve(__dirname, "../../..",p),"utf8");

describe("ZoeBuild persistent React preview host",()=>{
 const host=read("src/components/builder/PersistentReactPreviewHost.tsx");
 const shell=read("src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
 const client=read("src/app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient.tsx");

 it("owns one RemoteWebPreview with Preview and Code outlets",()=>{
  expect(host.match(/<RemoteWebPreview/g)?.length??0).toBe(1);
  expect(shell).toContain('slotId="project-preview"');
  expect(client).toContain('slotId="code-preview"');
  expect(host).toContain("activeSlotId");
 });

 it("parks browser state for the runner ten-minute idle window",()=>{
  expect(host).toContain("10 * 60_000");
  expect(host).toContain('"hidden"');
  expect(host).not.toContain("/cancel");
 });

 it("fails closed when the authenticated app shell disables preview persistence",()=>{
  expect(host).toContain("enabled?:boolean");
  expect(host).toContain("if (!enabled) return ()=>undefined;");
  expect(host).toContain("if (!enabled) return;");
  expect(host).toContain("setEntry(null);");
  expect(host).toContain("enabled&&entry?.preview");
 });

 it("does not weaken the iframe sandbox",()=>{
  expect(host).not.toContain("allow-same-origin");
 });
});
