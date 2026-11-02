import {readFileSync} from "node:fs";
import {describeZoeActionReceipt} from "./zoeConversationV2";
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
    // V2 moved user-visible receipt text into the shared, typed action helper.
    // Check both routing and the actual outcome without freezing its location.
    expect(shell).toContain('describeZoeActionReceipt({kind:"settings-opened"');
    const connectedSetup = describeZoeActionReceipt({
      kind:"settings-opened", providerName:"Stripe", setupAvailable:true,
    });
    expect(connectedSetup).toContain("opened Stripe settings");
    expect(connectedSetup).toContain("haven't connected an account or activated payments");
    const unavailableSetup = describeZoeActionReceipt({
      kind:"settings-opened", providerName:"Supabase", setupAvailable:false,
    });
    expect(unavailableSetup).toContain("nothing was connected");
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
