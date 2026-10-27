import {describe,it,expect} from "vitest";
import {keepReviewedProposal, recoverReviewedProposal, clearReviewedProposal} from "./zoeReviewedProposalSessionV12K11N";
import type {ZoeSourceEditProposal} from "./zoeTargetedSourceEdit";

const edits: ZoeSourceEditProposal = {baseVersion:12, summary:"Review shared layout",
  edits:[{path:"src/pages/studio.tsx",beforeSha256:"a".repeat(64),
    content:"export default function Studio(){return null}",
    beforePreview:"old",afterPreview:"new"}]};
function mem() {
  const map = new Map<string,string>();
  return {getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)},
    removeItem:(k:string)=>{map.delete(k)},map};
}

describe("V12K11N same-tab pending proposal recovery",()=>{
  it("restores an exact unapplied proposal for same project and source revision",()=>{
    const storage=mem(); expect(keepReviewedProposal(storage,"project_one",edits,10)).toBe(true);
    expect(recoverReviewedProposal(storage,"project_one",12,11)).toEqual(edits);
    expect(recoverReviewedProposal(storage,"another_project",12,11)).toBeNull();
  });
  it("rejects and clears an old revision before any apply",()=>{
    const storage=mem();keepReviewedProposal(storage,"p",edits,10);
    expect(recoverReviewedProposal(storage,"p",13,11)).toBeNull();
    expect(recoverReviewedProposal(storage,"p",12,11)).toBeNull();
  });
  it("expires drafts and refuses tampered storage or forged build proof",()=>{
    const storage=mem();keepReviewedProposal(storage,"p",edits,10);
    expect(recoverReviewedProposal(storage,"p",12,10+13*60*60*1000)).toBeNull();
    storage.setItem("zoebuild:reviewed-source-proposal:v12k11n:p",JSON.stringify({version:1,
      projectId:"p",savedAt:20,proposal:{...edits,edits:[{...edits.edits[0],path:""}]}}));
    expect(recoverReviewedProposal(storage,"p",12,25)).toBeNull();
    keepReviewedProposal(storage,"p",{...edits,buildVerification:{state:"passed",sourceVersion:12,
      snapshotSha256:"a".repeat(64),artifactSha256:"a".repeat(64),reason:"fake",message:"fake",browser:"not-run"}},40);
    expect(recoverReviewedProposal(storage,"p",12,41)?.buildVerification).toBeUndefined();
  });
  it("clears only its project and never bypasses unavailable storage",()=>{
    const storage=mem();keepReviewedProposal(storage,"a",edits);keepReviewedProposal(storage,"b",edits);
    clearReviewedProposal(storage,"a");expect(recoverReviewedProposal(storage,"a",12)).toBeNull();
    expect(recoverReviewedProposal(storage,"b",12)).not.toBeNull();
    const denied={getItem:()=>{throw Error("denied")},setItem:()=>{throw Error("denied")},removeItem:()=>{throw Error("denied")}};
    expect(keepReviewedProposal(denied,"p",edits)).toBe(false);
    expect(recoverReviewedProposal(denied,"p",12)).toBeNull();
  });
});
