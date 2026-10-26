import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  assertZoeProductionResultWriter, inspectZoeProductionSecrets,
  assertZoeProductionBillingReady,
} from "./zoeProductionBillingGate";

const candidate = {provider:"openai" as const,model:"gpt-6-luna",tier:"economy" as const,reason:"test"};
const old = randomBytes(32).toString("base64");
const newest = randomBytes(32).toString("base64");
const source = readFileSync(new URL("./serverOwnedZoeBuildMetering.ts",import.meta.url),"utf8");

describe("V12J.19 one fail-closed production billing gate",()=>{
  it("supports a distinct v3 writer without relabeling historical v1 ciphertext",()=>{
    expect(assertZoeProductionResultWriter({v3:newest,activeKeyId:"v3"})).toBe("v3");
    expect(assertZoeProductionResultWriter({v1:old,v3:newest,activeKeyId:"v3"})).toBe("v3");
    expect(()=>assertZoeProductionResultWriter({v1:old,activeKeyId:"v3"}))
      .toThrow("AI_RESULT_ACTIVE_KEY_MISSING");
    expect(()=>assertZoeProductionResultWriter({v1:newest,v3:newest,activeKeyId:"v3"}))
      .toThrow("AI_RESULT_KEY_ROTATION_REQUIRES_DISTINCT_KEY");
  });
  it("refuses missing/incorrect provider and invalid or missing secret",()=>{
    expect(()=>inspectZoeProductionSecrets({providerId:"gemini",providerKey:"present",keys:{v3:newest,activeKeyId:"v3"}}))
      .toThrow("AI_BILLING_PROVIDER_NOT_REVIEWED");
    expect(()=>inspectZoeProductionSecrets({providerId:"openai",providerKey:"",keys:{v3:newest,activeKeyId:"v3"}}))
      .toThrow("AI_BILLING_PROVIDER_KEY_MISSING");
    expect(()=>inspectZoeProductionSecrets({providerId:"openai",providerKey:"present",keys:{v3:"invalid",activeKeyId:"v3"}}))
      .toThrow("AI_RESULT_ENCRYPTION_KEY_REQUIRED");
    expect(inspectZoeProductionSecrets({providerId:"openai",providerKey:"present",keys:{v3:newest,activeKeyId:"v3"}}).writerKeyId)
      .toBe("v3");
  });
  it("production compiled approval registry still fails closed, regardless of secrets",()=>{
    expect(()=>assertZoeProductionBillingReady(candidate,new Date("2026-10-24T10:00:00Z")))
      .toThrow("AI_BILLING_MODEL_NOT_REVIEWED");
  });
  it("wires the same gate into paid planning, intent, edit and answer operations",()=>{
    expect(source).toContain("assertZoeProductionBillingReady(candidate, at);");
    expect(source).toContain("assertZoeProductionBillingReady(candidate, occurredAt);");
    expect(source).toContain('purpose: "intent" | "edit" | "answer"');
    expect(source).not.toContain('process.env.NODE_ENV === "development"');
  });
});
