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

  it("registers the native iframe from the trusted renderer, not the shared immutable renderer",()=>{
   const native=read("src/components/builder/DevelopmentRemoteWebPreview.tsx");
   expect(native).toContain("registerDevelopmentHmrDocument(root,documentUrl,frame)");
   expect(native).toContain("ref={bindFrame}");
   expect(native).toContain('sandbox="allow-scripts"');
  });
 it("does not weaken the iframe sandbox",()=>{
  expect(host).not.toContain("allow-same-origin");
 });
});

it("clears retained backdrop on disable, project change or terminal preview error",()=>{
 const host=read("src/components/builder/PersistentReactPreviewHost.tsx");
 expect(host).toContain('entry.preview?.state === "error"');
 expect(host).toContain('lastReadyPreviewRef.current=null;');
 expect(host).toContain('inert={!shown}');
});

 it("uses one shared route input and a connection-derived native status",()=>{
  const native=read("src/components/builder/DevelopmentRemoteWebPreview.tsx");
  const hook=read("src/components/builder/useReactDevelopmentPreview.ts");
  const selector=read("src/components/builder/useReactVitePreview.ts");
  expect(native).toContain("<PreviewAddressBar");
  expect(native).not.toContain("<select");
  expect(native).not.toContain('"Document loaded"');
  expect(native).toContain('preview.hmrConnection === "live" && delivery === "delivered"');
  expect(hook).toContain("onConnectionState:state=>");
  expect(selector).toContain('runtimeMode:"fallback"');
 });

it("keeps the development iframe source independent from client-side navigation",()=>{
  const native=read("src/components/builder/DevelopmentRemoteWebPreview.tsx");
  expect(native).toContain("developmentPreviewDocumentUrl(root, documentRoute)");
  expect(native).toContain('sendDevelopmentNavigation(root,{action:"navigate",route})');
  expect(native).toContain("subscribeDevelopmentNavigation(root,state=>");
  expect(native).not.toContain("developmentPreviewDocumentUrl(root, page)");
});
