import {describe,expect,it} from "vitest";
import {formatCustomerCredits,formatPackCreditValue} from "./customerCreditDisplay";
describe("V12J.28E exact customer-facing credit display",()=>{
 it("shows customer credits, not a misleading raw ledger unit balance",()=>{
  expect(formatCustomerCredits("500000","en-US")).toBe("500");
  expect(formatCustomerCredits("1725000","en-US")).toBe("1,725");
  expect(formatCustomerCredits("0","en-US")).toBe("0");
 });
 it("does not silently round or discard a fraction of a credit",()=>{
  expect(formatCustomerCredits("1","en-US")).toBe("0.001");
  expect(formatCustomerCredits("500501","en-US")).toBe("500.501");
  expect(formatCustomerCredits("-1250","en-US")).toBe("-1.25");
 });
 it("localizes the fractional decimal separator",()=>{
  expect(formatCustomerCredits("1250","fr-FR")).toBe("1,25");
 });
 it("never mislabels a non-divisible fixed Stripe pack as whole credits",()=>{
  expect(formatPackCreditValue("500000","en-US")).toBe("500 credits");
  expect(formatPackCreditValue("500001","en-US")).toBe("500,001 ledger units");
  expect(formatPackCreditValue("bad","en-US")).toBe("Unavailable");
 });
});
