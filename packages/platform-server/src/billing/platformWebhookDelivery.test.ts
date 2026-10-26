import {describe, expect, it, vi} from "vitest";
import {processPlatformBillingWebhook} from "./platformWebhookDelivery";
const event = {id:"evt_1",type:"customer.subscription.updated",livemode:false,created:1};
function deps() {
  return {
    event, relevant:vi.fn().mockReturnValue(true),
    references:vi.fn().mockReturnValue({objectId:"sub_1",customerId:"cus_1",subscriptionId:"sub_1"}),
    claim:vi.fn().mockResolvedValue({kind:"claimed",attemptCount:3}),
    reconcile:vi.fn().mockResolvedValue({kind:"processed",action:"subscription_reconciled"}),
    markIgnored:vi.fn().mockResolvedValue(true),
    markProcessed:vi.fn().mockResolvedValue(true),
    markFailed:vi.fn().mockResolvedValue(true),
    reportError:vi.fn(),
  };
}
describe("canonical platform billing webhook delivery",()=>{
  it("ignores irrelevant events without claiming",async()=>{
    const input=deps();input.relevant.mockReturnValue(false);
    expect(await processPlatformBillingWebhook(input)).toEqual({status:200,body:{received:true,outcome:"unrelated"}});
    expect(input.claim).not.toHaveBeenCalled();
  });
  it("deduplicates confirmed terminal events",async()=>{
    const input=deps();input.claim.mockResolvedValue({kind:"duplicate",status:"processed"});
    expect((await processPlatformBillingWebhook(input)).body).toMatchObject({duplicate:true,outcome:"processed"});
    expect(input.reconcile).not.toHaveBeenCalled();
  });
  it("refuses simultaneous processing without reconciling",async()=>{
    const input=deps();input.claim.mockResolvedValue({kind:"in_progress"});
    expect((await processPlatformBillingWebhook(input)).status).toBe(409);
    expect(input.reconcile).not.toHaveBeenCalled();
  });
  it("claims with trusted event references and marks successful attempt",async()=>{
    const input=deps();
    expect((await processPlatformBillingWebhook(input)).body).toMatchObject({outcome:"processed"});
    expect(input.claim).toHaveBeenCalledWith({...event,objectId:"sub_1",customerId:"cus_1",subscriptionId:"sub_1"});
    expect(input.markProcessed).toHaveBeenCalledWith("evt_1",3);
    expect(input.markFailed).not.toHaveBeenCalled();
  });
  it("commits ignored event status after reconciliation",async()=>{
    const input=deps();input.reconcile.mockResolvedValue({kind:"ignored",reason:"unmapped_subscription"});
    expect((await processPlatformBillingWebhook(input)).body).toMatchObject({outcome:"ignored"});
    expect(input.markIgnored).toHaveBeenCalledWith("evt_1",3,"unmapped_subscription");
  });
  it("records failed attempts and surfaces retryable HTTP 500",async()=>{
    const input=deps();const error=new Error("temporary");input.reconcile.mockRejectedValue(error);
    expect((await processPlatformBillingWebhook(input)).status).toBe(500);
    expect(input.markFailed).toHaveBeenCalledWith("evt_1",3,error);
    expect(input.reportError).toHaveBeenCalledWith("reconciliation",error);
  });
  it("retains failure semantics if marking terminal processed fails",async()=>{
    const input=deps();input.markProcessed.mockResolvedValue(false);
    expect((await processPlatformBillingWebhook(input)).status).toBe(500);
    expect(input.markFailed).toHaveBeenCalledOnce();
  });
  it("reports ledger failures without masking the original processing error",async()=>{
    const input=deps();input.reconcile.mockRejectedValue(new Error("provider"));input.markFailed.mockRejectedValue(new Error("ledger"));
    expect((await processPlatformBillingWebhook(input)).status).toBe(500);
    expect(input.reportError).toHaveBeenCalledWith("mark_failed",expect.any(Error));
    expect(input.reportError).toHaveBeenCalledWith("reconciliation",expect.any(Error));
  });
});
