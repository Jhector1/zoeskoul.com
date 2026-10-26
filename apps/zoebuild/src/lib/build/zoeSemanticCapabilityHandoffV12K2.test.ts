import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(relative:string)=>readFileSync(new URL(relative,import.meta.url),"utf8");
describe("V12K2 model-led provider decision and grounded project evidence",()=>{
  it("keeps action classification semantic but provider resolution exact",()=>{
    const intent=read("../../app/api/build/projects/[buildProjectId]/assistant/intent/route.ts");
    const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    expect(intent).toContain("providerDirectory:zoeProviderDirectoryEvidence()");
    expect(intent).toContain("User-named services, exclusions and prior project decisions outrank defaults");
    expect(shell).toContain("resolveZoeSelectedProvider(semantic.provider)");
    expect(shell).not.toContain("resolveZoeAssistantServiceIntent(`open");
    expect(shell).toContain("no connection or activation was changed");
  });
  it("does not grant provider connectivity based on directory display",()=>{
    const evidence=read("./zoeAssistantServiceIntent.ts");
    expect(evidence).not.toContain("connected:true");
    expect(evidence).toContain("setupFor(provider.id,section)");
    const answer=read("../../app/api/build/projects/[buildProjectId]/assistant/answer/route.ts");
    expect(answer).toContain("providerDirectory:zoeProviderDirectoryEvidence()");
    expect(answer).toContain("never claim a directory entry means an account is connected");
  });
  it("keeps existing metering, owners and source version checks",()=>{
    const intent=read("../../app/api/build/projects/[buildProjectId]/assistant/intent/route.ts");
    expect(intent).toContain("enforceSameOriginPost(req)");
    expect(intent).toContain("getBuildProjectCommand");
    expect(intent).toContain("sourceVersion !== baseVersion");
    expect(intent).toContain("requireZoeAiBillingOperationId");
  });
});
