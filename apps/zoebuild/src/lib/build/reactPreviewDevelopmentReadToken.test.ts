import {describe,expect,it} from "vitest";
import {randomBytes,randomUUID} from "node:crypto";
import {
  issueDevelopmentPreviewReadToken,
  verifyDevelopmentPreviewReadToken,
  DEVELOPMENT_PREVIEW_READ_TOKEN_TTL_MS,
} from "./reactPreviewDevelopmentReadToken";

const secret = randomBytes(32).toString("base64url");
const wrongSecret = randomBytes(32).toString("base64url");
const now = 1_900_000_000_000;
const input = {
  userId:"user_test", buildProjectId:"project_test",
  previewId:`preview_${randomUUID()}`,sourceVersion:7,
};
describe("Phase 4E2B encrypted browser-read token foundation (not routed)",()=>{
 it("authenticates exact identity, revision and short expiry without plaintext claims",()=>{
  const token=issueDevelopmentPreviewReadToken(input,secret,now);
  expect(token).toMatch(/^dpv1\.[A-Za-z0-9_-]+$/);
  expect(token).not.toContain(input.userId);
  expect(token).not.toContain(input.previewId);
  expect(verifyDevelopmentPreviewReadToken(token,secret,now+1)).toEqual({
    ...input,expiresAt:now+DEVELOPMENT_PREVIEW_READ_TOKEN_TTL_MS,
  });
 });
 it("does not accept tampered, truncated or wrong-key capabilities",()=>{
  const token=issueDevelopmentPreviewReadToken(input,secret,now);
  for(const candidate of [token.slice(0,-5),token.slice(0,20)+(token[20]==="A"?"B":"A")+token.slice(21),token.replace("dpv1.","dpv2."),"bad",""])
    expect(()=>verifyDevelopmentPreviewReadToken(candidate,secret,now)).toThrow();
  expect(()=>verifyDevelopmentPreviewReadToken(token,wrongSecret,now)).toThrow();
 });
 it("expires after two minutes; future-issued tokens are not accepted",()=>{
  const token=issueDevelopmentPreviewReadToken(input,secret,now);
  expect(()=>verifyDevelopmentPreviewReadToken(token,secret,now+DEVELOPMENT_PREVIEW_READ_TOKEN_TTL_MS)).toThrow();
  expect(()=>verifyDevelopmentPreviewReadToken(token,secret,now-1)).toThrow();
 });
 it("refuses malformed project, user, preview or source revision",()=>{
  for(const value of [
    {...input,userId:""}, {...input,userId:"../user"},
    {...input,buildProjectId:"../../other"}, {...input,previewId:"preview_other"},
    {...input,sourceVersion:0}, {...input,sourceVersion:1.5},
  ]) expect(()=>issueDevelopmentPreviewReadToken(value,secret,now)).toThrow();
 });
 it("requires an independent 32-byte key; cannot run without configured secret",()=>{
  for(const key of ["", "testing-secret",randomBytes(16).toString("base64url")]) {
    expect(()=>issueDevelopmentPreviewReadToken(input,key,now)).toThrow();
    const valid=issueDevelopmentPreviewReadToken(input,secret,now);
    expect(()=>verifyDevelopmentPreviewReadToken(valid,key,now)).toThrow();
  }
 });
});
