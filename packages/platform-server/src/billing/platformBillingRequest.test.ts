import {describe,expect,it} from "vitest";
import {isTrustedBillingMutation,billingLocale} from "./platformBillingRequest";
describe("platform billing mutation requests",()=>{
 it("requires exact origin, including in development",()=>{
  const url="http://localhost:3004/api/billing/portal";
  expect(isTrustedBillingMutation(new Request(url,{headers:{origin:"http://localhost:3004"}}))).toBe(true);
  expect(isTrustedBillingMutation(new Request(url))).toBe(false);
  expect(isTrustedBillingMutation(new Request(url,{headers:{origin:"http://evil.test"}}))).toBe(false);
 });
 it("accepts a configured canonical app origin behind an internal reverse proxy",()=>{
  const req=new Request("http://127.0.0.1:3004/api/billing/checkout",
    {method:"POST",headers:{origin:"https://zoebuild.example.test"}});
  expect(isTrustedBillingMutation(req)).toBe(false);
  expect(isTrustedBillingMutation(req,"https://zoebuild.example.test")).toBe(true);
  expect(isTrustedBillingMutation(req,"https://another.example.test")).toBe(false);
 });
 it("allows the exact configured localhost development origin, not an arbitrary local origin",()=>{
  const req=new Request("http://127.0.0.1:3004/api/billing/checkout",
    {method:"POST",headers:{origin:"http://localhost:3004"}});
  expect(isTrustedBillingMutation(req,"http://localhost:3004")).toBe(true);
  expect(isTrustedBillingMutation(req,"http://localhost:3005")).toBe(false);
  expect(isTrustedBillingMutation(req,"https://localhost:3004")).toBe(false);
 });
 it("does not trust header-derived or malformed configured origins",()=>{
  const req=new Request("http://internal:3004/api/billing/checkout",
    {method:"POST",headers:{origin:"https://attacker.test",host:"attacker.test","x-forwarded-host":"attacker.test"}});
  for(const configured of [null,undefined,"https://other.test","https://attacker.test/path",
    "https://user:pass@attacker.test","http://attacker.test","https://attacker.test?unsafe=yes"]) {
    expect(isTrustedBillingMutation(req,configured)).toBe(false);
  }
  expect(isTrustedBillingMutation(new Request("http://internal:3004/api/billing/checkout",
    {method:"POST",headers:{host:"attacker.test","x-forwarded-host":"attacker.test"}}),
    "https://attacker.test")).toBe(false);
 });
 it("never admits cross-site POSTs merely because the proxy or config exists",()=>{
  const req=new Request("http://internal:3004/api/billing/checkout",
    {method:"POST",headers:{origin:"https://evil.test",host:"zoebuild.example.test"}});
  expect(isTrustedBillingMutation(req,"https://zoebuild.example.test")).toBe(false);
 });
 it("limits billing return paths to known locales",()=>{
  expect(billingLocale("es")).toBe("es");expect(billingLocale("../../admin")).toBe("en");
 });
});
