import {describe,it,expect} from "vitest";
import {CREDIT_DOMAINS} from "./creditLedgerCore";

/** Consumer protocol invariant: Student uses Web's tutoring API, not the Builder wallet. */
describe("student and builder credit domain boundary",()=>{
  it("uses stable distinct domain identifiers and never a shared spendable balance",()=>{
    expect(CREDIT_DOMAINS.tutoring).toBe("tutoring_minutes");
    expect(CREDIT_DOMAINS.builder).toBe("zoebuild_ai_units");
    expect(CREDIT_DOMAINS.tutoring).not.toBe(CREDIT_DOMAINS.builder);
  });
});
