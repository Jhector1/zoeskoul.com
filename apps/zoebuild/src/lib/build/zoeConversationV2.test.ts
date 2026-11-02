import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {describeZoeActionReceipt, ZOE_NATURAL_CONVERSATION_POLICY} from "./zoeConversationV2";
import {describeZoePublishedRecord} from "./zoeDeploymentEvidence";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");

describe("Zoé V2 natural language and authoritative outcomes",()=>{
  it("opens settings without claiming a connection",()=>{
    const text=describeZoeActionReceipt({kind:"settings-opened",providerName:"Stripe",setupAvailable:true});
    expect(text).toContain("opened Stripe settings");
    expect(text).toContain("haven't connected");
    expect(describeZoeActionReceipt({kind:"settings-opened",providerName:"Supabase",setupAvailable:false})).toContain("doesn't have a working setup flow");
  });
  it("distinguishes proposed, saved and verified source",()=>{
    const proposed=describeZoeActionReceipt({kind:"source-proposed",fileCount:2,summary:"Share the header"});
    expect(proposed).toContain("Review the proposal");
    expect(proposed).toContain("hasn't changed");
    const saved=describeZoeActionReceipt({kind:"source-saved",sourceVersion:207});
    expect(saved).toContain("checking the saved files");
    expect(saved).not.toContain("Verified");
    const verified=describeZoeActionReceipt({kind:"source-verified",sourceVersion:207,verifiedPaths:["src/App.tsx"]});
    expect(verified).toContain("Verified 1 saved file");
    expect(verified).toContain("visual result still needs checking");
    expect(describeZoeActionReceipt({kind:"source-sync-unverified"})).toContain("Don't apply the same changes again");
  });
  it("does not claim an applied plan is a published website",()=>{
    expect(describeZoeActionReceipt({kind:"plan-applied",sourceVersion:209})).toContain("doesn't mean the site was published");
  });
  it("distinguishes published history from a current-version publication",()=>{
    const snapshot={deploymentId:"dep1",sourceVersion:8,publicUrl:"https://example.com/sites/a/",deployedAt:"2026-11-01T00:00:00Z"};
    const older=describeZoePublishedRecord(snapshot,9);
    const current=describeZoePublishedRecord(snapshot,8);
    expect(older.state).toBe("ready-deployment-record");
    expect(current.state).toBe("ready-deployment-record");
    if (older.state!=="ready-deployment-record" || current.state!=="ready-deployment-record") throw new Error("Unexpected deployment evidence");
    expect(older.isCurrentSourcePublished).toBe(false);
    expect(current.isCurrentSourcePublished).toBe(true);
    expect(describeZoePublishedRecord(null,9)).toEqual({state:"no-ready-deployment-record"});
  });
  it("routes verified deployment evidence to the answer, never untrusted browser fields",()=>{
    const answer=read("../../app/api/build/projects/[buildProjectId]/assistant/answer/route.ts");
    const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    expect(answer).toContain("resolveZoeDeploymentReality({");
    expect(answer).toContain("deploymentEvidence,");
    expect(answer).toContain("ZOE_NATURAL_CONVERSATION_POLICY,");
    expect(shell).toContain("describeZoeActionReceipt(");
    expect(answer).toContain("getBuildProjectCommand(");
    expect(answer).toContain("createRequiredZoeBuildAssistantTransport");
  });
  it("prioritizes natural language but preserves existing review gates",()=>{
    expect(ZOE_NATURAL_CONVERSATION_POLICY).toContain("not an audit log");
    const shell=read("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    expect(shell).toContain("acceptReviewedProposal(editResult.proposal)");
    expect(shell).toContain("refreshAfterSuccessfulApply(savedVersion, approvedEdits)");
    expect(shell).toContain('semantic.action === "provider_settings"');
    expect(shell).toContain("readZoeAnswerEventStream(answerResponse)");
  });
});
