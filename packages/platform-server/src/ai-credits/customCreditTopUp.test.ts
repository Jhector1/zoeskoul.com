import {describe,it,expect} from "vitest";
import {ZOE_TOP_UP_POLICY,quoteZoeTopUpDollars,quoteZoeTopUpUsdMinor,quoteZoeTopUpCredits} from "./customCreditTopUp";
describe("V12J.28A proposed custom top-up pricing",()=>{
 it("preserves $5 = 500 credits = 500000 ledger units",()=>expect(quoteZoeTopUpDollars("5")).toMatchObject({amountUsdMinor:500,customerCredits:500,creditUnits:"500000"}));
 it("supports presets and fractional dollars",()=>{for(const [d,c] of [["10",1000],["20",2000],["50",5000],["12.34",1234]] as const) expect(quoteZoeTopUpDollars(d).customerCredits).toBe(c);});
 it("round-trips credit entry",()=>expect(quoteZoeTopUpCredits("1500")).toEqual(quoteZoeTopUpDollars("15")));
 it("enforces exact boundaries",()=>{expect(quoteZoeTopUpDollars("500").creditUnits).toBe("50000000");for(const v of ["4.99","500.01","-5","5.999","1e2"," 5","05","5,00","NaN", "Infinity", "99999999999999999999999999", ""]) expect(()=>quoteZoeTopUpDollars(v)).toThrow("AI_CREDIT_TOPUP_AMOUNT_INVALID");});
 it("rejects non-integer cents, NaN, overflow, coercion",()=>{for(const v of [null,undefined,"500",NaN,Infinity,500.5,-500,50100,Number.MAX_SAFE_INTEGER+1])expect(()=>quoteZoeTopUpUsdMinor(v)).toThrow("AI_CREDIT_TOPUP_AMOUNT_INVALID");});
 it("rejects malformed credit entries",()=>{for(const v of ["0","-500","5.5","05","5e2", "9999999999999999999999", 500])expect(()=>quoteZoeTopUpCredits(v)).toThrow("AI_CREDIT_TOPUP_AMOUNT_INVALID");});
 it("does not grant permission to charge live",()=>expect(ZOE_TOP_UP_POLICY.liveAuthorized).toBe(false));
});
