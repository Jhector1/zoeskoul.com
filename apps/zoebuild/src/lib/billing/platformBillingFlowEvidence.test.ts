import {describe,expect,it} from "vitest";
import {builderBillingFlowChecks,builderFlowPassed,builderSandboxMode,classifyBuilderCheckoutSession,type BuilderBillingEvidence} from "./platformBillingFlowEvidence";
const base:BuilderBillingEvidence={mode:"test",planConfigured:true,customerLinked:true,
  subscriptionRecorded:true,subscriptionActive:true,subscriptionStatus:"active",
  currentPeriodEnd:null,cancelAtPeriodEnd:false,webhookProcessed:true,webhookProcessedAt:null,
  generateGrant:true,editGrant:true,checkoutReturn:"verified",checkedAt:"2026-10-21T00:00:00.000Z"};

describe("real Builder billing verification semantics",()=>{
  it("only accepts a complete, test-mode, customer-owned flow",()=>{
    expect(builderFlowPassed(base)).toBe(true);
    expect(builderBillingFlowChecks(base)).toHaveLength(5);
  });
  it("never claims success from a Stripe redirect or missing session",()=>{
    for(const checkoutReturn of ["not_checked","pending","invalid","unavailable"] as const)
      expect(builderFlowPassed({...base,checkoutReturn})).toBe(false);
  });
  it("requires actual processed webhook and both subscription grants",()=>{
    expect(builderFlowPassed({...base,webhookProcessed:false})).toBe(false);
    expect(builderFlowPassed({...base,generateGrant:false})).toBe(false);
    expect(builderFlowPassed({...base,editGrant:false})).toBe(false);
    expect(builderFlowPassed({...base,subscriptionActive:false})).toBe(false);
    expect(builderFlowPassed({...base,customerLinked:false})).toBe(false);
  });
  it("rejects live and unconfigured payments from sandbox success",()=>{
    for(const mode of ["live","missing"] as const) expect(builderFlowPassed({...base,mode})).toBe(false);
    expect(builderFlowPassed({...base,planConfigured:false})).toBe(false);
  });
  it("correlates a paid Stripe Checkout session with authenticated owner/product/subscription",()=>{
    const input={session:{mode:"subscription",status:"complete",paymentStatus:"paid",livemode:false,
      userId:"self",billingProduct:"builder_ai",priceId:"price_builder",customerId:"cus_self",subscriptionId:"sub_self"},
      userId:"self",customerId:"cus_self",subscriptionIds:["sub_self"],builderPriceIds:["price_builder"],expectedLivemode:false};
    expect(classifyBuilderCheckoutSession(input)).toBe("verified");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,userId:"other"}})).toBe("invalid");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,customerId:"cus_other"}})).toBe("invalid");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,billingProduct:"learning"}})).toBe("invalid");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,livemode:true}})).toBe("invalid");
    // A migrated subscription may have an old Checkout price. The *current*
    // customer-owned subscription and server-authored Builder metadata still
    // establish its product, without trusting user-supplied redirects.
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,priceId:"price_old_builder"}})).toBe("verified");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,priceId:"price_old_builder",subscriptionId:"sub_foreign"}})).toBe("invalid");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,subscriptionId:"sub_foreign"}})).toBe("paid_unreconciled");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,status:"open"}})).toBe("pending");
  });
  it("rejects historical price reuse without a verified current Builder subscription",()=>{
    const input={session:{mode:"subscription",status:"complete",paymentStatus:"paid",livemode:false,
      userId:"self",billingProduct:"builder_ai",priceId:"price_historical",customerId:"cus_owner",subscriptionId:"sub_old"},
      userId:"self",customerId:"cus_owner",subscriptionIds:[],builderPriceIds:["price_current"],expectedLivemode:false};
    expect(classifyBuilderCheckoutSession(input)).toBe("invalid");
    expect(classifyBuilderCheckoutSession({...input,subscriptionIds:["sub_old"]})).toBe("verified");
    expect(classifyBuilderCheckoutSession({...input,subscriptionIds:["sub_old"],session:{...input.session,userId:"attacker"}})).toBe("invalid");
    expect(classifyBuilderCheckoutSession({...input,subscriptionIds:["sub_old"],session:{...input.session,customerId:"cus_wrong"}})).toBe("invalid");
    expect(classifyBuilderCheckoutSession({...input,subscriptionIds:["sub_old"],session:{...input.session,billingProduct:"learning"}})).toBe("invalid");
    expect(classifyBuilderCheckoutSession({...input,subscriptionIds:["sub_old"],session:{...input.session,livemode:true}})).toBe("invalid");
  });
  it("marks a paid Stripe session as paid while webhook and DB reconciliation are pending",()=>{
    const waiting:BuilderBillingEvidence={...base,checkoutReturn:"paid_unreconciled",
      subscriptionRecorded:false,subscriptionActive:false,webhookProcessed:false,
      generateGrant:false,editGrant:false};
    const steps=builderBillingFlowChecks(waiting);
    expect(steps.map(s=>s.state)).toEqual(["passed","passed","pending","pending","pending"]);
    expect(builderFlowPassed(waiting)).toBe(false);
    expect(steps[1].detail).toContain("Do not pay again");
  });
  it("never accepts unpaid or wrong-customer Checkout as independent payment evidence",()=>{
    const input={session:{mode:"subscription",status:"complete",paymentStatus:"paid",livemode:false,
      userId:"self",billingProduct:"builder_ai",priceId:"price_builder",customerId:"cus_owner",subscriptionId:"sub_new"},
      userId:"self",customerId:"cus_owner",subscriptionIds:[],builderPriceIds:["price_builder"],expectedLivemode:false};
    expect(classifyBuilderCheckoutSession(input)).toBe("paid_unreconciled");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,paymentStatus:"unpaid"}})).toBe("pending");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,userId:"different"}})).toBe("invalid");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,customerId:"cus_other"}})).toBe("invalid");
    expect(classifyBuilderCheckoutSession({...input,session:{...input.session,livemode:true}})).toBe("invalid");
  });
  it("never displays stale webhook-pending copy after a migrated test Checkout is fully verified",()=>{
    const migrated={...base,checkoutReturn:"paid_unreconciled" as const};
    expect(builderFlowPassed(migrated)).toBe(true);
    const payment=builderBillingFlowChecks(migrated).find(c=>c.id==="checkout");
    expect(payment?.state).toBe("passed");
    expect(payment?.detail).toContain("now reconciled");
    expect(payment?.detail).not.toContain("not yet");
  });
  it("still tells the user not to pay again while signed reconciliation is pending",()=>{
    const unreconciled={...base,checkoutReturn:"paid_unreconciled" as const,
      webhookProcessed:false,subscriptionActive:false,generateGrant:false,editGrant:false};
    expect(builderFlowPassed(unreconciled)).toBe(false);
    const payment=builderBillingFlowChecks(unreconciled).find(c=>c.id==="checkout");
    expect(payment?.state).toBe("passed");
    expect(payment?.detail).toContain("Do not pay again");
  });
  it("recognizes only correctly prefixed Stripe keys without revealing them",()=>{
    expect(builderSandboxMode("sk_test_example")).toBe("test");
    expect(builderSandboxMode("sk_live_example")).toBe("live");
    expect(builderSandboxMode("whsec_test")).toBe("missing");
  });
});
