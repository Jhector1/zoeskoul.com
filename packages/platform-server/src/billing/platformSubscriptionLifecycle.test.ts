import {describe,it,expect,vi} from "vitest";
import {collectPlatformSubscriptionPages,synchronizePlatformCustomerSubscriptions} from "./platformSubscriptionLifecycle";
const sub = (id:string, customer="cus_1") => ({id,customer});
function mockDeps() {
 return {
  readCustomerId:vi.fn().mockResolvedValue("cus_1"),
  verifyCustomer:vi.fn().mockResolvedValue({id:"cus_1",deleted:false}),
  clearCustomerId:vi.fn().mockResolvedValue(undefined),
  fetchAllSubscriptions:vi.fn().mockResolvedValue([sub("sub_1"),sub("sub_2")]),
  persistSubscription:vi.fn().mockResolvedValue(undefined),
  expireMissing:vi.fn().mockResolvedValue(undefined),
  isMissingCustomerError:vi.fn().mockImplementation((e:unknown)=>Boolean(e && typeof e==="object" && "code" in e && e.code==="resource_missing")),
 };
}
describe("canonical platform subscription synchronization",()=>{
 it("persists complete provider state before expiring stale records",async()=>{
  const d=mockDeps();const order:string[]=[];
  d.persistSubscription.mockImplementation(async()=>{order.push("persist")});
  d.expireMissing.mockImplementation(async()=>{order.push("expire")});
  await synchronizePlatformCustomerSubscriptions({userId:" self ",deps:d});
  expect(d.readCustomerId).toHaveBeenCalledWith("self");
  expect(d.persistSubscription).toHaveBeenCalledTimes(2);
  expect(d.expireMissing).toHaveBeenCalledWith("self",["sub_1","sub_2"]);
  expect(order).toEqual(["persist","persist","expire"]);
 });
 it("expires stale data when no customer binding exists",async()=>{
  const d=mockDeps();d.readCustomerId.mockResolvedValue(null);
  await synchronizePlatformCustomerSubscriptions({userId:"self",deps:d});
  expect(d.expireMissing).toHaveBeenCalledWith("self",[]);
  expect(d.fetchAllSubscriptions).not.toHaveBeenCalled();
 });
 it("clears definitely deleted customer before expiring",async()=>{
  const d=mockDeps();d.verifyCustomer.mockResolvedValue({deleted:true});
  await synchronizePlatformCustomerSubscriptions({userId:"self",deps:d});
  expect(d.clearCustomerId).toHaveBeenCalledWith("self");
  expect(d.expireMissing).toHaveBeenCalledWith("self",[]);
 });
 it("recovers a definitely missing customer, never on other provider errors",async()=>{
  const d=mockDeps();d.verifyCustomer.mockRejectedValue({code:"resource_missing"});
  await synchronizePlatformCustomerSubscriptions({userId:"self",deps:d});
  expect(d.clearCustomerId).toHaveBeenCalledOnce();
  const err=new Error("network");d.verifyCustomer.mockRejectedValue(err);
  await expect(synchronizePlatformCustomerSubscriptions({userId:"self",deps:d})).rejects.toBe(err);
  expect(d.clearCustomerId).toHaveBeenCalledTimes(1);
 });
 it("refuses foreign customers without any local persistence or expiration",async()=>{
  const d=mockDeps();d.fetchAllSubscriptions.mockResolvedValue([sub("sub_1","cus_foreign")]);
  await expect(synchronizePlatformCustomerSubscriptions({userId:"self",deps:d})).rejects.toThrow("inconsistent");
  expect(d.persistSubscription).not.toHaveBeenCalled();expect(d.expireMissing).not.toHaveBeenCalled();
 });
 it("refuses repeated subscriptions and invalid identity",async()=>{
  const d=mockDeps();d.fetchAllSubscriptions.mockResolvedValue([sub("sub_1"),sub("sub_1")]);
  await expect(synchronizePlatformCustomerSubscriptions({userId:"self",deps:d})).rejects.toThrow();
  await expect(synchronizePlatformCustomerSubscriptions({userId:" ",deps:d})).rejects.toThrow();
  expect(d.expireMissing).not.toHaveBeenCalled();
 });
 it("preserves existing access when provider fetch or local persistence fails",async()=>{
  const d=mockDeps();d.fetchAllSubscriptions.mockRejectedValueOnce(new Error("provider offline"));
  await expect(synchronizePlatformCustomerSubscriptions({userId:"self",deps:d})).rejects.toThrow("offline");
  d.persistSubscription.mockRejectedValueOnce(new Error("db offline"));
  await expect(synchronizePlatformCustomerSubscriptions({userId:"self",deps:d})).rejects.toThrow("db offline");
  expect(d.expireMissing).not.toHaveBeenCalled();
 });
 it("collects every page, honoring provider cursors",async()=>{
  const listPage=vi.fn().mockResolvedValueOnce({data:[{id:"sub_1"}],has_more:true})
    .mockResolvedValueOnce({data:[{id:"sub_2"}],has_more:false});
  expect(await collectPlatformSubscriptionPages({listPage})).toEqual([{id:"sub_1"},{id:"sub_2"}]);
  expect(listPage.mock.calls.map(a=>a[0])).toEqual([undefined,"sub_1"]);
 });
 it("never accepts truncated or stalled pages",async()=>{
  const listPage=vi.fn().mockResolvedValue({data:[{id:"sub_1"}],has_more:true});
  await expect(collectPlatformSubscriptionPages({listPage,maxPages:3})).rejects.toThrow();
  expect(listPage).toHaveBeenCalledTimes(2);
  const empty=vi.fn().mockResolvedValue({data:[],has_more:true});
  await expect(collectPlatformSubscriptionPages({listPage:empty})).rejects.toThrow();
 });
});
