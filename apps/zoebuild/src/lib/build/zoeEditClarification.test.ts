import {describe,it,expect} from "vitest";
import {makeZoeEditClarification} from "./zoeEditClarification";

describe("E17H semantic no-change clarification",()=>{
  it("preserves an actual model question",()=>{
    expect(makeZoeEditClarification(" The page already has a header. What should change about it? "))
      .toBe("The page already has a header. What should change about it?");
  });
  it("does not pass through a generic validator failure",()=>{
    expect(makeZoeEditClarification("Expected one to three approved file changes."))
      .toContain("What specific part");
  });
  it("bounds arbitrary model output and avoids source or untrusted code",()=>{
    expect(makeZoeEditClarification("x".repeat(900)+"?")).toContain("No files were changed");
    expect(makeZoeEditClarification(null)).toContain("No files were changed");
  });
});
