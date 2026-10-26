import {describe, expect, it} from "vitest";
import {projectBuilderBillingPlan} from "./platformBuilderPlans";
const catalog = [{product:"builder_ai" as const, tier:"subscription" as const, priceId:"price_builder"},
  {product:"learning" as const, tier:"monthly" as const, priceId:"price_learn"}];
const provider = {id:"price_builder",active:true,currency:"usd",unit_amount:1900,recurring:{interval:"month",interval_count:1},nickname:"Builder"};
describe("platform Builder billing plan projection",()=>{
 it("renders only an allowed paid Builder price",()=>expect(projectBuilderBillingPlan(catalog,provider)).toMatchObject({priceId:"price_builder",unitAmountMinor:1900,interval:"month"}));
 it("rejects learning prices even if Stripe reports them active",()=>expect(()=>projectBuilderBillingPlan(catalog,{...provider,id:"price_learn"})).toThrow());
 it("rejects inactive, one-time, or broken prices",()=>{
  expect(()=>projectBuilderBillingPlan(catalog,{...provider,active:false})).toThrow();
  expect(()=>projectBuilderBillingPlan(catalog,{...provider,recurring:null})).toThrow();
  expect(()=>projectBuilderBillingPlan(catalog,{...provider,unit_amount:null})).toThrow();
 });
});
