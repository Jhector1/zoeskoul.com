import {describe, expect, it} from "vitest";
import {buildZoeCapabilityEvidence, ZOE_CAPABILITY_CONVERSATION_POLICY} from "./zoeCapabilityEvidence";

const input = {
  project: {stackId: "react-vite-v1", status: "draft", sourceVersion: 28},
  publishEnabled: false,
  aiEditAllowed: true,
  commerceLookup: "loaded" as const,
  commerceStorePresent: true,
  connections: [] as {provider:string;environment:string;status:string}[],
  routes: [] as {provider:string;environment:string;capability:string;connected:boolean}[],
  runtimeProviders: [
    {id: "stripe", executableCapabilities: ["payments"], connectionRequired:true},
    {id: "square", executableCapabilities: [], connectionRequired:true},
  ],
};

describe("Zoé server-owned capability awareness", () => {
  it("states actual React/Vite scope without claiming Next.js/Spring Boot execution", () => {
    const reality=buildZoeCapabilityEvidence(input);
    expect(reality.projectRuntime.currentProjectSupported).toBe(true);
    expect(reality.projectRuntime.nextJsServerRuntime).toBe("not-supported");
    expect(reality.projectRuntime.springBootJavaRuntime).toBe("not-supported");
    expect(reality.operations.reactVitePreview).toContain("not-probed");
    expect(reality.operations.isolatedProductionBuild).toBe("implemented-but-not-run");
    expect(reality.operations.compiledSitePublish).toContain("unavailable");
  });
  it("does not turn a directory listing into a connected or executable service", () => {
    const reality=buildZoeCapabilityEvidence(input);
    expect(reality.providerDirectory.some(category=>category.providers.some(p=>p.id==="square"))).toBe(true);
    expect(reality.commerce.providers.find(p=>p.id==="square")?.executableCapabilities).toEqual([]);
    expect(reality.commerce.providers.find(p=>p.id==="stripe")?.connectionObservation)
      .toBe("no-active-connection-observed");
  });
  it("separates active connection observation from execution or deployment success", () => {
    const reality=buildZoeCapabilityEvidence({...input,publishEnabled:true,
      connections:[{provider:"stripe",environment:"test",status:"active"}],
      routes:[{provider:"stripe",environment:"test",capability:"payments",connected:true}]});
    expect(reality.commerce.providers.find(p=>p.id==="stripe")?.connectionObservation)
      .toBe("active-connection-observed");
    expect(reality.operations.compiledSitePublish).toContain("requires-authorized-build");
    expect(reality.evidenceLimits.join(" ")).toContain("not a live Runner health check");
  });
  it("keeps database failures unknown instead of guessing no provider connection", () => {
    const reality=buildZoeCapabilityEvidence({...input,commerceLookup:"failed"});
    expect(reality.commerce.providers.find(p=>p.id==="stripe")?.connectionObservation).toBe("unknown");
    expect(reality.commerce.projectStoreObservation).toBe("unknown");
  });
  it("restricts archived and unsupported projects and independently gated editing", () => {
    const archived=buildZoeCapabilityEvidence({...input,project:{stackId:"react-vite-v1",status:"archived",sourceVersion:28}});
    expect(archived.operations.projectSourceEditProposal).toContain("unavailable");
    const legacy=buildZoeCapabilityEvidence({...input,project:{stackId:"static-html-v1",status:"draft",sourceVersion:28}});
    expect(legacy.projectRuntime.currentProjectSupported).toBe(false);
    const noAccess=buildZoeCapabilityEvidence({...input,aiEditAllowed:false});
    expect(noAccess.operations.projectSourceEditProposal).toContain("unavailable");
  });
  it("requires honest correction without model-specific keyword triggers", () => {
    expect(ZOE_CAPABILITY_CONVERSATION_POLICY).toContain("correct it candidly");
    expect(ZOE_CAPABILITY_CONVERSATION_POLICY).toContain("never promise in-product execution");
  });
  it("integrates reality in answer, intent and edit routes", async () => {
    const {readFileSync} = await import("node:fs");
    for(const route of ["answer","intent","edit"]){
      const s=readFileSync(new URL(`../../app/api/build/projects/[buildProjectId]/assistant/${route}/route.ts`,import.meta.url),"utf8");
      expect(s).toContain("resolveZoeCapabilityReality(");
      expect(s).toContain("ZOE_CAPABILITY_CONVERSATION_POLICY");
      expect(s).toContain("capabilityEvidence");
    }
  });
});
