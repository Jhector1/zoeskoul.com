import { describe,it,expect,vi } from "vitest";
vi.mock("server-only",()=>({}));
import {privatePublishSelection,parsePrivatePublishReceipt} from "./privatePublishControl";
const env={NODE_ENV:"development",ZOEBUILD_PUBLISH_ENABLED:"0",ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION:"1",ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER:"owner1",ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT:"project1"};
const receipt={projectId:"project1",sourceVersion:3,objectSha256:"a".repeat(64),artifactSha256:"b".repeat(64),activatedAt:"2026-11-24T00:00:00+00:00",publicUrl:"https://untrusted.example/"};
describe("private publishing control boundary",()=>{
  it("requires explicit local project, owner, development and disabled public publishing",()=>{
    expect(privatePublishSelection("http://localhost:3004","project1",env)).toEqual({ownerId:"owner1"});
    for(const change of [{NODE_ENV:"production"},{ZOEBUILD_PUBLISH_ENABLED:"1"},{ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION:undefined},{ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER:undefined},{ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT:"project2"},{ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT:undefined}]) expect(privatePublishSelection("http://localhost:3004","project1",{...env,...change})).toBeNull();
    expect(privatePublishSelection("http://127.0.0.1:3004","project1",env)).toBeNull();
    expect(privatePublishSelection("https://zoeskoul.com","project1",env)).toBeNull();
  });
  it("reconstructs a fixed private site URL, never trusting a supplied URL",()=>{
    expect(parsePrivatePublishReceipt(JSON.stringify(receipt),"project1")).toEqual({deploymentId:receipt.objectSha256,sourceVersion:3,artifactHash:receipt.artifactSha256,deployedAt:receipt.activatedAt,publicUrl:"http://127.0.0.1:33105/",privatePilot:true});
    expect(parsePrivatePublishReceipt("null","project1")).toBeNull();
  });
  it("rejects wrong project, version, artifact and object receipts",()=>{
    for(const change of [{projectId:"project2"},{sourceVersion:0},{artifactSha256:"bad"},{objectSha256:"bad"},{activatedAt:"bad"}]) expect(()=>parsePrivatePublishReceipt(JSON.stringify({...receipt,...change}),"project1")).toThrow();
    expect(()=>parsePrivatePublishReceipt(JSON.stringify(receipt),"project1",{sourceVersion:4,objectSha256:receipt.objectSha256,artifactHash:receipt.artifactSha256})).toThrow();
    expect(()=>parsePrivatePublishReceipt("null","project1",{sourceVersion:3,objectSha256:receipt.objectSha256,artifactHash:receipt.artifactSha256})).toThrow();
  });
});
