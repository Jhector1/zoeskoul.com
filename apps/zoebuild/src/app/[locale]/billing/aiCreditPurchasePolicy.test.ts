import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {creditCatalogAvailabilityMessage,getOrCreateCreditCheckoutAttempt,parseAiCreditCatalog} from "./aiCreditPurchasePolicy";
const pack={priceId:"price_reviewed",amountUsdMinor:500,creditUnits:"500000"};
const uuid="123e4567-e89b-42d3-a456-426614174000";
const id=`zb-ai-${uuid}`;const now=1770000000000;
function store(seed?:string){let value:string|null=seed??null;return {getItem:(_key:string)=>value,setItem:(_key:string,v:string)=>{value=v;},current:()=>value};}
describe("V12J.21 mode-aware credit purchase presentation",()=>{
 it.each(["off","sandbox-only","live"] as const)("accepts consistent empty %s catalog",mode=>{
  expect(parseAiCreditCatalog({available:false,mode,packs:[]})).toEqual({available:false,mode,packs:[]});
 });
 it.each(["sandbox-only","live"] as const)("accepts verified %s offerings",mode=>{
  expect(parseAiCreditCatalog({available:true,mode,packs:[pack]}).packs).toEqual([pack]);
 });
 it("rejects available without packs, off-mode packs and unknown environment",()=>{
  for(const bad of [{available:true,mode:"live",packs:[]},{available:true,mode:"off",packs:[pack]},
   {available:true,mode:"auto",packs:[pack]}])expect(()=>parseAiCreditCatalog(bad)).toThrow();
 });
 it("rejects invalid prices, duplicates, negative amounts and overflow units",()=>{
  for(const packs of [[pack,pack],[{...pack,priceId:"invalid"}],[{...pack,amountUsdMinor:-2}],
   [{...pack,creditUnits:"-1"}],[{...pack,creditUnits:"9223372036854775808"}]])
   expect(()=>parseAiCreditCatalog({available:true,mode:"live",packs})).toThrow();
 });
 it("distinguishes missing live and test offerings",()=>{
  expect(creditCatalogAvailabilityMessage("live")).toMatch(/live credit packs/);
  expect(creditCatalogAvailabilityMessage("sandbox-only")).toMatch(/test credit packs/);
 });
 it("stores a mode-bound attempt and idempotently reuses its ID",()=>{
  const storage=store();const args={storage,mode:"live" as const,priceId:pack.priceId,now,createUuid:()=>uuid};
  expect(getOrCreateCreditCheckoutAttempt(args)).toBe(id);
  expect(getOrCreateCreditCheckoutAttempt({...args,createUuid:()=>{throw Error("must not call");}})).toBe(id);
  expect(JSON.parse(storage.current()!).mode).toBe("live");
 });
 it("refuses automatic identity rotation across mode, price or expiry",()=>{
  const storage=store();const args={storage,mode:"live" as const,priceId:pack.priceId,now,createUuid:()=>uuid};
  getOrCreateCreditCheckoutAttempt(args);
  expect(()=>getOrCreateCreditCheckoutAttempt({...args,mode:"sandbox-only"})).toThrow(/needs verification/);
  expect(()=>getOrCreateCreditCheckoutAttempt({...args,priceId:"price_other"})).toThrow(/needs verification/);
  expect(()=>getOrCreateCreditCheckoutAttempt({...args,now:now+81*60*1000})).toThrow(/needs verification/);
 });
 it("preserves an outstanding historical test attempt but refuses live reuse",()=>{
  const storage=store(JSON.stringify({priceId:pack.priceId,id,time:now}));
  expect(getOrCreateCreditCheckoutAttempt({storage,mode:"sandbox-only",priceId:pack.priceId,now,createUuid:()=>uuid})).toBe(id);
  expect(()=>getOrCreateCreditCheckoutAttempt({storage,mode:"live",priceId:pack.priceId,now,createUuid:()=>uuid})).toThrow(/needs verification/);
 });
 it("fails closed on corrupt storage and unavailable storage",()=>{
  expect(()=>getOrCreateCreditCheckoutAttempt({storage:store("invalid json"),mode:"live",priceId:pack.priceId,now,createUuid:()=>uuid})).toThrow(/needs verification/);
  const denied={getItem:(_key:string)=>null,setItem:(_key:string,_value:string)=>{throw Error("no storage");}};
  expect(()=>getOrCreateCreditCheckoutAttempt({storage:denied,mode:"live",priceId:pack.priceId,now,createUuid:()=>uuid})).toThrow(/storage is unavailable/);
 });
 it("retains the existing billing UI and requires live acknowledgment",()=>{
  const panel=readFileSync(new URL("./AiCreditPacksPanel.tsx",import.meta.url),"utf8");
  expect(panel).toContain('mode==="live"');expect(panel).toContain("parseAiCreditCatalog");
  expect(panel).toContain("getOrCreateCreditCheckoutAttempt");expect(panel).toContain("real payment");
  expect(panel).not.toContain("current $5 pack");
 });
});
