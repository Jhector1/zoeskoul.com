import {describe,it,expect} from "vitest";
import {registeredBuilderStripeProducts,stripePriceProductId,verifiedStripePlatformProduct,requireVerifiedBuilderStripePrice} from "./platformStripeProductIdentity";
const catalog=[{product:"learning" as const,tier:"yearly" as const,priceId:"price_founder"},
  {product:"builder_ai" as const,tier:"subscription" as const,priceId:"price_builder"}];
const products=new Set(["prod_builder"]);
describe("Stripe product identity must be independently verified",()=>{
 it("refuses the learning yearly product even when its price is mislabeled builder",()=>{
  expect(()=>requireVerifiedBuilderStripePrice({catalog:[{product:"builder_ai",tier:"subscription",priceId:"price_founder"}],priceId:"price_founder",stripeProductId:"prod_learning",builderProductIds:products})).toThrow();
 });
 it("rejects missing product registration and missing metadata for Builder grants",()=>{
  expect(verifiedStripePlatformProduct({priceId:"price_builder",stripeProductId:"prod_builder",catalog,builderProductIds:products})).toBeNull();
  expect(verifiedStripePlatformProduct({priceId:"price_builder",stripeProductId:"prod_builder",catalog,builderProductIds:new Set(),subscriptionProductHint:"builder_ai"})).toBeNull();
 });
 it("accepts only matching product + explicit subscription intent",()=>{
  expect(verifiedStripePlatformProduct({priceId:"price_builder",stripeProductId:"prod_builder",catalog,builderProductIds:products,subscriptionProductHint:"builder_ai"})).toBe("builder_ai");
  expect(verifiedStripePlatformProduct({priceId:"price_builder",stripeProductId:"prod_learning",catalog,builderProductIds:products,subscriptionProductHint:"builder_ai"})).toBeNull();
 });
 it("parses Stripe product string and expanded object safely",()=>{
  expect(stripePriceProductId("prod_builder")).toBe("prod_builder");
  expect(stripePriceProductId({id:"prod_builder"})).toBe("prod_builder");
  expect(registeredBuilderStripeProducts({ZOEBUILD_AI_STRIPE_PRODUCT_IDS:"prod_builder"}).has("prod_builder")).toBe(true);
  expect(()=>registeredBuilderStripeProducts({ZOEBUILD_AI_STRIPE_PRODUCT_IDS:"bad"})).toThrow();
 });
});
