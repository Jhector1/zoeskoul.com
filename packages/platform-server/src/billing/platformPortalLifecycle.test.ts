import {describe,it,expect,vi} from "vitest";
import {createPlatformBillingPortalSession} from "./platformPortalLifecycle";
function setup(url="https://zoebuild.example.com/billing") {
 let customer="cus_old";
 const customerDeps = {
  findUser:vi.fn().mockImplementation(async()=>({email:"u@example.com",stripeCustomerId:customer})),
  setCustomerId:vi.fn().mockImplementation(async(_user:string,id:string|null)=>{customer=id??""}),
  retrieveCustomer:vi.fn().mockResolvedValue({deleted:false}),
  createCustomer:vi.fn().mockResolvedValue({id:"cus_new"}),
 };
 return {userId:"self",returnUrl:url,customerDeps,
  createSession:vi.fn().mockResolvedValue({url:"https://billing.stripe.com/session/test"})};
}
describe("platform billing portal",()=>{
 it("uses verified platform customer and trusted app return URL",async()=>{
  const args=setup();expect(await createPlatformBillingPortalSession(args)).toMatchObject({url:"https://billing.stripe.com/session/test"});
  expect(args.createSession).toHaveBeenCalledWith("cus_old",args.returnUrl);
 });
 it("rejects script, embedded credentials and fragments",async()=>{
  for(const url of ["javascript:alert(1)","https://alice:pw@example.com/billing","https://example.com/billing#fragment"]){
   const args=setup(url);await expect(createPlatformBillingPortalSession(args)).rejects.toThrow();
   expect(args.createSession).not.toHaveBeenCalled();
  }
 });
 it("keeps customer recovery in one shared engine",async()=>{
  const args=setup();args.createSession.mockRejectedValueOnce({code:"resource_missing",param:"customer"})
    .mockResolvedValueOnce({url:"https://billing.stripe.com/session/ok"});
  expect((await createPlatformBillingPortalSession(args)).url).toContain("session/ok");
  expect(args.createSession.mock.calls.map(x=>x[0])).toEqual(["cus_old","cus_new"]);
 });
 it("refuses non-HTTPS provider URL",async()=>{
  const args=setup();args.createSession.mockResolvedValue({url:"http://billing.stripe.com/session"});
  await expect(createPlatformBillingPortalSession(args)).rejects.toThrow();
 });
});
