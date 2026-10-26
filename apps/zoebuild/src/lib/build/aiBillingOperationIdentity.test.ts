import { describe, expect, it } from "vitest";
import { requireZoeAiBillingOperationId, ZoeAiOperationIdentityError, ZOE_AI_OPERATION_HEADER } from "./aiBillingOperationIdentity";

const uuid = "8d352d31-5185-4b22-b670-f8edc0674e13";
const get = (purpose: "plan"|"intent"|"edit", projectId?: string, supplied: string|null = uuid) =>
  requireZoeAiBillingOperationId({purpose, projectId, supplied});

describe("V12J.9E stable billable AI operation identity", () => {
  it("uses a fixed, boring header name", () => {
    expect(ZOE_AI_OPERATION_HEADER).toBe("X-ZoeBuild-Ai-Operation-Id");
  });
  it("reuses the exact ledger identity for an HTTP retry of the same plan", () => {
    expect(get("plan")).toBe(get("plan"));
    expect(get("plan")).toBe(`zb:plan:${uuid}`);
  });
  it("namespaces intent vs edit vs plan even for the same logical submission", () => {
    expect(new Set([get("plan"),get("intent","project_1"),get("edit","project_1")]).size).toBe(3);
  });
  it("namespaces different projects without relying on user headers for ownership", () => {
    expect(get("edit","project_1")).not.toBe(get("edit","project_2"));
  });
  it("refuses missing, malformed, non-v4, whitespace and oversized browser input", () => {
    for (const supplied of [null,"", "x", " "+uuid, uuid+" ","z".repeat(200),
      "8d352d31-5185-1b22-b670-f8edc0674e13", "8d352d31-5185-4b22-1670-f8edc0674e13"]) {
      expect(() => get("plan",undefined,supplied)).toThrow(ZoeAiOperationIdentityError);
    }
  });
  it("rejects missing or injected project identity", () => {
    for (const projectId of [undefined,"","abc/def","../route","x".repeat(49)])
      expect(() => get("edit",projectId)).toThrow("AI_BILLING_OPERATION_ID_REQUIRED");
  });
  it("accepts uppercase UUID but canonicalizes one ledger key", () => {
    expect(get("plan",undefined,uuid.toUpperCase())).toBe(get("plan"));
  });
  it("supports the longest permitted project identity within downstream executor bound", () => {
    expect(get("edit","x".repeat(48)).length).toBeLessThanOrEqual(100);
  });
});
