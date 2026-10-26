import {describe,it,expect,vi} from "vitest";
import {prepareReservedPlatformCheckout} from "./platformReservedCheckoutGate";
const attempt="11111111-1111-4111-8111-111111111111";
const oldAttempt="22222222-2222-4222-8222-222222222222";
function deps(){return {userId:"me",attemptId:attempt,priceId:"price_builder",useTrial:false,
 reserve:vi.fn().mockResolvedValue({kind:"reserved",reservedAt:new Date("2026-10-21")}),
 release:vi.fn().mockResolvedValue(true), findSession:vi.fn().mockResolvedValue(null)};}
const conflicting=(i:ReturnType<typeof deps>)=>i.reserve.mockResolvedValue({kind:"conflict",reservedAt:new Date(),checkoutAttemptId:oldAttempt});
const previous=(status:string,priceId="price_builder")=>({id:"cs_1",mode:"subscription",status,url:"https://checkout.stripe.com/cs_1",metadata:{priceId,useTrial:"false",checkoutAttemptId:oldAttempt}});
describe("canonical Checkout reservation gate",()=>{
 it("permits a newly reserved attempt",async()=>{const d=deps();expect((await prepareReservedPlatformCheckout(d)).kind).toBe("ready")});
 it("resumes the exact previously opened checkout without creating a new one",async()=>{const d=deps();conflicting(d);d.findSession.mockResolvedValue(previous("open"));expect((await prepareReservedPlatformCheckout(d)).kind).toBe("resume");expect(d.release).not.toHaveBeenCalled()});
 it("never replaces another platform product",async()=>{const d=deps();conflicting(d);d.findSession.mockResolvedValue(previous("open","price_learning"));expect((await prepareReservedPlatformCheckout(d)).kind).toBe("conflict");expect(d.release).not.toHaveBeenCalled()});
 it("does not assume a missing Stripe session is expired",async()=>{const d=deps();conflicting(d);expect((await prepareReservedPlatformCheckout(d)).kind).toBe("conflict");expect(d.release).not.toHaveBeenCalled()});
 it("releases only a Stripe-confirmed expired conflicting attempt",async()=>{const d=deps();d.reserve.mockResolvedValueOnce({kind:"conflict",checkoutAttemptId:oldAttempt,reservedAt:new Date()}).mockResolvedValueOnce({kind:"reserved",reservedAt:new Date()});d.findSession.mockResolvedValue(previous("expired"));expect((await prepareReservedPlatformCheckout(d)).kind).toBe("ready");expect(d.release).toHaveBeenCalledWith("me",oldAttempt)});
 it("prevents duplicate checkout after a completed old attempt",async()=>{const d=deps();conflicting(d);d.findSession.mockResolvedValue(previous("complete"));expect((await prepareReservedPlatformCheckout(d)).kind).toBe("completed")});
 it("never retries a stale same attempt with a second POST",async()=>{const d=deps();d.reserve.mockResolvedValue({kind:"stale_attempt",reservedAt:new Date()});expect((await prepareReservedPlatformCheckout(d)).kind).toBe("stale")});
 it("refuses missing account",async()=>{const d=deps();d.reserve.mockResolvedValue({kind:"missing_user"});expect((await prepareReservedPlatformCheckout(d)).kind).toBe("missing_user")});
 it("propagates provider outages instead of releasing a reservation",async()=>{const d=deps();conflicting(d);d.findSession.mockRejectedValue(new Error("offline"));await expect(prepareReservedPlatformCheckout(d)).rejects.toThrow("offline");expect(d.release).not.toHaveBeenCalled()});
});
