import {describe,it,expect} from "vitest";
import {isAiCreditShortage,isAiCreditShortageCode,ZoeAiCreditShortageError} from "./creditShortage";
describe("credit shortage semantics",()=>{
  it("only recognizes explicit server codes",()=>{
    for(const code of ["INSUFFICIENT_CREDITS","AI_CREDITS_INSUFFICIENT","BUILD_AI_CREDITS_EXHAUSTED"])
      expect(isAiCreditShortageCode(code)).toBe(true);
    for(const code of ["BUILD_AUTH_REQUIRED","BUILD_AI_INTENT_METERING_NOT_WIRED","",null])
      expect(isAiCreditShortageCode(code)).toBe(false);
  });
  it("does not infer credit exhaustion from arbitrary text",()=>{
    expect(isAiCreditShortage(new Error("Your credits are 0"))).toBe(false);
    expect(isAiCreditShortage({code:"BUILD_AUTH_REQUIRED",message:"insufficient credits"})).toBe(false);
    expect(isAiCreditShortage(new ZoeAiCreditShortageError())).toBe(true);
  });
});
