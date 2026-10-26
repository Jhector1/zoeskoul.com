import {describe,it,expect,vi} from "vitest";
import {classifyCheckoutRecoveryError,reportCheckoutRecoveryFailure,withCheckoutRecoveryAudit}
  from "./zoeBuildAiCreditCheckoutDiagnostics";

describe("V12J29E safe read-only checkout recovery diagnostics",()=>{
  it("categorizes known Prisma errors without printing their messages",()=>{
    expect(classifyCheckoutRecoveryError({code:"P2022",message:"db password SECRET"}))
      .toEqual({category:"prisma",code:"P2022"});
  });
  it("classifies provider authentication and network errors without provider data",()=>{
    expect(classifyCheckoutRecoveryError({type:"StripeAuthenticationError",raw:{secret:"sk_test_SECRET"}}))
      .toEqual({category:"stripe-auth"});
    expect(classifyCheckoutRecoveryError({type:"StripeAPIConnectionError"}))
      .toEqual({category:"stripe-network"});
    expect(classifyCheckoutRecoveryError({type:"StripeRateLimitError"}))
      .toEqual({category:"stripe-rate-limit"});
    expect(classifyCheckoutRecoveryError({type:"StripeInvalidRequestError"}))
      .toEqual({category:"stripe-request"});
  });
  it("does not echo arbitrary error codes or names",()=>{
    expect(classifyCheckoutRecoveryError({code:"sk_test_NOT_A_CODE",name:"Customer_ABC"}))
      .toEqual({category:"unclassified"});
    expect(classifyCheckoutRecoveryError(null)).toEqual({category:"unclassified"});
  });
  it("writes only the approved stage, category and safe code",()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try{
      reportCheckoutRecoveryFailure("attempt",{code:"P2022",message:"SECRET Stripe customer cus_private",stack:"PASSWORD"});
      expect(log).toHaveBeenCalledWith("ZB_CHECKOUT_RECOVERY_READ_FAILURE",
        {stage:"attempt",category:"prisma",code:"P2022"});
      const output=JSON.stringify(log.mock.calls);
      expect(output).not.toContain("SECRET");
      expect(output).not.toContain("cus_private");
      expect(output).not.toContain("PASSWORD");
    } finally {log.mockRestore();}
  });
  it("audits explicit Stripe expiration failure using only safe fields",async()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try{
      const error=Object.assign(new Error("PRIVATE Stripe secret sk_test_DO_NOT_LOG"),
        {type:"StripeInvalidRequestError",raw:{customer:"cus_PRIVATE"}});
      await expect(withCheckoutRecoveryAudit("stripe-expire",async()=>{throw error;})).rejects.toBe(error);
      expect(log).toHaveBeenCalledWith("ZB_CHECKOUT_RECOVERY_READ_FAILURE",
        {stage:"stripe-expire",category:"stripe-request"});
      expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
      expect(JSON.stringify(log.mock.calls)).not.toContain("sk_test_");
    }finally{log.mockRestore();}
  });
  it("returns the exact successful read without logging",async()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try{
      const value={id:"opaque"};
      expect(await withCheckoutRecoveryAudit("stripe-session",async()=>value)).toBe(value);
      expect(log).not.toHaveBeenCalled();
    }finally{log.mockRestore();}
  });
  it("logs sanitized failure and rethrows exact underlying exception",async()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try{
      const error=Object.assign(new Error("CREDENTIAL SECRET"),{code:"P1001"});
      await expect(withCheckoutRecoveryAudit("grant-ledger",async()=>{throw error;})).rejects.toBe(error);
      expect(log).toHaveBeenCalledWith("ZB_CHECKOUT_RECOVERY_READ_FAILURE",
        {stage:"grant-ledger",category:"prisma",code:"P1001"});
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET");
    }finally{log.mockRestore();}
  });
});
