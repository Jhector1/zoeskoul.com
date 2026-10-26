import { describe, expect, it } from "vitest";
import { activePlatformProductSubscription } from "./subscriptionProjection";
const catalog = [{product:"learning" as const,tier:"monthly" as const,priceId:"price_learning"},{product:"builder_ai" as const,tier:"subscription" as const,priceId:"price_builder"}];
const now = new Date("2026-10-20T12:00:00Z");
const sub = (priceId:string, until:string) => ({priceId,status:"active",trialEnd:null,currentPeriodEnd:new Date(until)});
describe("distinct platform subscription products", () => {
 it("never unlocks learning from builder and vice versa", () => {
   const subscriptions = [sub("price_builder","2026-11-01T00:00:00Z")];
   expect(activePlatformProductSubscription({product:"learning",catalog,subscriptions,now})).toBeNull();
   expect(activePlatformProductSubscription({product:"builder_ai",catalog,subscriptions,now})).not.toBeNull();
 });
 it("ignores unrecognized and expired product prices", () => {
   expect(activePlatformProductSubscription({product:"builder_ai",catalog,subscriptions:[sub("price_builder","2026-01-01T00:00:00Z"),sub("price_unknown","2026-11-01T00:00:00Z")],now})).toBeNull();
 });
});
