import {describe,expect,it} from "vitest";
import {resolveZoeSelectedProvider,zoeProviderDirectoryEvidence} from "./zoeAssistantServiceIntent";

describe("V12K2 semantic provider selection after model classification",()=>{
  it("resolves canonical provider selections without keyword gates or connection claims",()=>{
    expect(resolveZoeSelectedProvider("commerce:shopify"))?.toMatchObject({kind:"provider",section:"commerce",providerId:"shopify",setup:"shopify-oauth"});
    expect(resolveZoeSelectedProvider("payments:stripe"))?.toMatchObject({kind:"provider",section:"payments",providerId:"stripe",setup:"stripe-settings"});
    expect(resolveZoeSelectedProvider("commerce:zoebuild-native"))?.toMatchObject({kind:"provider",setup:"native"});
  });
  it("never silently substitutes Square or a database provider with Stripe",()=>{
    expect(resolveZoeSelectedProvider("payments:square"))?.toMatchObject({providerId:"square",setup:"unavailable"});
    expect(resolveZoeSelectedProvider("databases:supabase"))?.toMatchObject({providerId:"supabase",setup:"unavailable"});
    expect(resolveZoeSelectedProvider("databases:firebase"))?.toMatchObject({providerId:"firebase",setup:"unavailable"});
    expect(resolveZoeSelectedProvider("Square"))?.toEqual({kind:"ambiguous",name:"Square",sections:["commerce","payments"]});
  });
  it("does not interpret unconstrained user phrases as provider selections",()=>{
    expect(resolveZoeSelectedProvider("make the design Shopify-inspired")).toBeNull();
    expect(resolveZoeSelectedProvider("not Stripe")).toBeNull();
    expect(resolveZoeSelectedProvider("payments:stripe:other")).toBeNull();
    expect(resolveZoeSelectedProvider("databases:stripe")).toBeNull();
  });
  it("provides truthful catalog capability evidence, not connected status",()=>{
    const evidence=zoeProviderDirectoryEvidence();
    expect(evidence.find(x=>x.section==="databases")?.providers.some(p=>p.id==="neon"&&p.setup==="unavailable")).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain('"connected"');
  });
});
