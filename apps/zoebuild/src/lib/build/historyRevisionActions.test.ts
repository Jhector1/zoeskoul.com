import {describe,it,expect} from "vitest";
import {canDeleteHistoryRevision,canSwitchHistoryRevision} from "./historyRevisionActions";

describe("TanStack managed Version History capabilities",()=>{
  it("preserves the existing React history actions",()=>{
    expect(canSwitchHistoryRevision("react-vite-v1",{})).toBe(true);
    expect(canDeleteHistoryRevision("react-vite-v1")).toBe(true);
  });
  it("exposes only verified TanStack managed revisions for restore",()=>{
    expect(canSwitchHistoryRevision("tanstack-start-v1",{restoreAvailable:true})).toBe(true);
    expect(canSwitchHistoryRevision("tanstack-start-v1",{restoreAvailable:false})).toBe(false);
    expect(canSwitchHistoryRevision("tanstack-start-v1",{})).toBe(false);
    expect(canSwitchHistoryRevision("tanstack-start-v1",null)).toBe(false);
  });
  it("never offers legacy deletion on TanStack or unsupported stacks",()=>{
    expect(canDeleteHistoryRevision("tanstack-start-v1")).toBe(false);
    expect(canSwitchHistoryRevision("static-site-v1",{restoreAvailable:true})).toBe(false);
    expect(canDeleteHistoryRevision("static-site-v1")).toBe(false);
  });
});
