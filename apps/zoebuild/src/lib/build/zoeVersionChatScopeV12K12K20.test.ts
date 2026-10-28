import {describe,expect,it} from "vitest";
import {decodeZoeVersionChatScope,matchingZoeVersionScope,scopeForCodeProject} from "./zoeVersionChatScope";

describe("K20 saved-version chat scope",()=>{
  it("keeps a saved selection separate from monotonic source revisions",()=>{
    const scope=scopeForCodeProject(57,{activeHistoryVersion:16,activeHistorySourceVersion:57});
    expect(scope).toEqual({sourceVersion:57,savedVersion:16});
    expect(matchingZoeVersionScope(scope,{sourceVersion:57,savedVersion:15})).toBe(false);
    expect(matchingZoeVersionScope(scope,{sourceVersion:58,savedVersion:16})).toBe(false);
  });
  it("automatically begins a separate thread after ordinary source saves",()=>{
    expect(scopeForCodeProject(58,{activeHistoryVersion:16,activeHistorySourceVersion:57}))
      .toEqual({sourceVersion:58,savedVersion:58});
  });
  it("refuses malformed and untrusted chat identities",()=>{
    for(const value of [null,[],{sourceVersion:0,savedVersion:1},
      {sourceVersion:2,savedVersion:3},{sourceVersion:1.2,savedVersion:1},
      {sourceVersion:"57",savedVersion:16},{sourceVersion:57,savedVersion:"16"}])
      expect(decodeZoeVersionChatScope(value)).toBeNull();
  });
  it("enforces version-specific persistence and guards against stale browser responses",()=>{
    expect(matchingZoeVersionScope({sourceVersion:57,savedVersion:16},{sourceVersion:57,savedVersion:16})).toBe(true);
    expect(matchingZoeVersionScope(null,{sourceVersion:57,savedVersion:16})).toBe(false);
  });
});
