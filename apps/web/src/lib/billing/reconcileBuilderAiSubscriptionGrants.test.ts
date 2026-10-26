import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureKey } from "@zoeskoul/db";
const mocks = vi.hoisted(() => ({ reconcile: vi.fn(), actor: vi.fn(() => "canonical-actor") }));
vi.mock("server-only", () => ({}));
vi.mock("@zoeskoul/platform-server/access/reconcileFeatureGrant", () => ({
  reconcileFeatureGrant: mocks.reconcile,
  canonicalUserActorKey: mocks.actor,
}));
import { reconcileBuilderAiSubscriptionGrants } from "./reconcileBuilderAiSubscriptionGrants";

describe("canonical Builder AI grant projection", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.reconcile.mockResolvedValue({ id: "grant", active: true, changed: true }); });
  const client = {} as Parameters<typeof reconcileBuilderAiSubscriptionGrants>[0]["client"];
  it("creates two distinct subscription-owned grants for an eligible product", async () => {
    await reconcileBuilderAiSubscriptionGrants({client, userId:" user_1 ",
      eligibility: {subscriptionActive:true,productIncludesBuilderAi:true}, endsAt:null});
    expect(mocks.reconcile).toHaveBeenCalledTimes(2);
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.objectContaining({
      userId:"user_1", actorKey:"canonical-actor", type:"subscription", active:true,
      feature:FeatureKey.build_ai_generate,
    }));
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.objectContaining({
      userId:"user_1", type:"subscription", active:true, feature:FeatureKey.build_ai_edit,
    }));
  });
  it("revokes only subscription-owned grants when product is not eligible", async () => {
    await reconcileBuilderAiSubscriptionGrants({client,userId:"user_1",
      eligibility:{subscriptionActive:true,productIncludesBuilderAi:false}, endsAt:null});
    expect(mocks.reconcile).toHaveBeenCalledTimes(2);
    expect(mocks.reconcile.mock.calls.every(([call]) => call.active === false && call.type === "subscription")).toBe(true);
  });
  it("rejects blank identity before attempting any writes", async () => {
    await expect(reconcileBuilderAiSubscriptionGrants({client,userId:"   ",
      eligibility:{subscriptionActive:true,productIncludesBuilderAi:true}, endsAt:null})).rejects.toThrow();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
