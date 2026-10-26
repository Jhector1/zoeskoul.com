import {describe,it,expect} from "vitest";
import {CREDIT_DOMAINS,projectCreditAccount,projectTutoringMinuteBalance,
  projectBuilderCreditLotBalance,sameCreditEventFields} from "./creditLedgerCore";

describe("shared credit accounting primitives",()=>{
  it("projects tutoring minutes with pending-refund holds without double subtracting reservations",()=>{
    expect(projectTutoringMinuteBalance({availableMinutesDelta:90,reservedMinutesDelta:30,heldRefundMinutes:20}))
      .toEqual({availableMinutes:70,reservedMinutes:30,totalMinutes:100});
  });
  it("preserves zero and refuses over-held/negative/unsafe tutoring balances",()=>{
    expect(projectTutoringMinuteBalance({availableMinutesDelta:null,reservedMinutesDelta:null,heldRefundMinutes:null}))
      .toEqual({availableMinutes:0,reservedMinutes:0,totalMinutes:0});
    for(const input of [
      {availableMinutesDelta:10,reservedMinutesDelta:0,heldRefundMinutes:11},
      {availableMinutesDelta:10,reservedMinutesDelta:-1,heldRefundMinutes:0},
      {availableMinutesDelta:1.5,reservedMinutesDelta:0,heldRefundMinutes:0},
      {availableMinutesDelta:Number.MAX_SAFE_INTEGER,reservedMinutesDelta:1,heldRefundMinutes:0},
    ])expect(()=>projectTutoringMinuteBalance(input)).toThrow();
  });
  it("never combines tutoring minutes with builder units",()=>{
    const tutoring=projectCreditAccount({domain:CREDIT_DOMAINS.tutoring,available:30,reserved:0});
    const builder=projectCreditAccount({domain:CREDIT_DOMAINS.builder,available:30n,reserved:0n});
    expect(tutoring.domain).not.toBe(builder.domain);
    expect(tutoring.available).toBe(builder.available);
  });
  it("projects AI lots by funding source; excludes expired availability but retains reservations",()=>{
    const now=new Date("2026-10-22T00:00:00Z");
    expect(projectBuilderCreditLotBalance([
      {kind:"subscription",availableUnits:120n,reservedUnits:3n,expiresAt:new Date("2026-11-22")},
      {kind:"purchased",availableUnits:25n,reservedUnits:2n,expiresAt:null},
      {kind:"subscription",availableUnits:10n,reservedUnits:4n,expiresAt:new Date("2026-10-21")},
    ],now)).toEqual({subscriptionAvailableUnits:"120",purchasedAvailableUnits:"25",reservedUnits:"9"});
  });
  it("rejects corrupt AI balances and invalid dates",()=>{
    expect(()=>projectBuilderCreditLotBalance([{kind:"purchased",availableUnits:-1n,reservedUnits:0n,expiresAt:null}],new Date())).toThrow();
    expect(()=>projectBuilderCreditLotBalance([],new Date(NaN))).toThrow();
  });
  it("matches immutable idempotency fields, treating absent optional FK as null",()=>{
    const previous={userId:"u1",kind:"purchase_grant",availableMinutesDelta:60,reservedMinutesDelta:0,purchaseId:null};
    const expected={...previous,purchaseId:undefined};
    expect(sameCreditEventFields(previous,expected,["userId","kind","availableMinutesDelta","reservedMinutesDelta","purchaseId"])).toBe(true);
    expect(sameCreditEventFields(previous,{...expected,userId:"u2"},["userId","kind"])).toBe(false);
    expect(()=>sameCreditEventFields(previous,expected,[])).toThrow();
  });
});
