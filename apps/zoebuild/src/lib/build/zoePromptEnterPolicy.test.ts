import {describe,it,expect} from "vitest";
import {shouldSubmitZoePromptOnEnter} from "./zoePromptEnterPolicy";

describe("Zoé prompt Enter behavior",()=>{
  it("submits on unmodified Enter",()=>{
    expect(shouldSubmitZoePromptOnEnter({key:"Enter",shiftKey:false,isComposing:false})).toBe(true);
  });
  it("preserves Shift+Enter newlines and regular text keys",()=>{
    expect(shouldSubmitZoePromptOnEnter({key:"Enter",shiftKey:true,isComposing:false})).toBe(false);
    expect(shouldSubmitZoePromptOnEnter({key:"a",shiftKey:false,isComposing:false})).toBe(false);
  });
  it("never submits while confirming IME text",()=>{
    expect(shouldSubmitZoePromptOnEnter({key:"Enter",shiftKey:false,isComposing:true})).toBe(false);
    expect(shouldSubmitZoePromptOnEnter({key:"Enter",shiftKey:false,isComposing:false,keyCode:229})).toBe(false);
  });
});
