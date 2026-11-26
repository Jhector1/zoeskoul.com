import {describe,it,expect} from "vitest";
import {allowsDedicatedFencedDevOperator as allow} from "./hostedFencedDevAdmission";
const projectId="cmwvhcusk0002u0dlwhxh9uh2";
const env={NODE_ENV:"development",ZOEBUILD_PUBLISH_ENABLED:"0",ZOEBUILD_HOSTED_PUBLISH_DEV:"1",ZOEBUILD_HOSTED_FENCED_DEV:"1",ZOEBUILD_HOSTED_FENCED_DEV_PROJECT:projectId,ZOEBUILD_HOSTED_PUBLISH_DEV_OWNER:"owner-one"};
const input={origin:"http://localhost:3004",projectId,userId:"owner-one",selectedOwnerId:"owner-one",env};
describe("dedicated fenced dev operator admission",()=>{
  it("admits only the selected local operator",()=>{expect(allow(input)).toBe(true);expect(allow({...input,origin:"http://127.0.0.1:3004"})).toBe(true);});
  it("rejects production and nonlocal origins",()=>{for(const origin of ["https://example.com","http://localhost:3003","http://localhost:3004.evil.example"])expect(allow({...input,origin})).toBe(false);for(const e of [{NODE_ENV:"production"},{VERCEL_ENV:"production"},{NODE_ENV:"test"}])expect(allow({...input,env:{...env,...e}})).toBe(false);});
  it("rejects mismatched owner, selection and project",()=>{for(const change of [{userId:"other"},{userId:""},{selectedOwnerId:"other"},{projectId:"cmw4n3kv70006u8dl1xji1rvr"},{projectId:"other"}])expect(allow({...input,...change})).toBe(false);expect(allow({...input,env:{...env,ZOEBUILD_HOSTED_PUBLISH_DEV_OWNER:"other"}})).toBe(false);});
  it("requires every opt-in and the public publishing off switch",()=>{for(const key of ["ZOEBUILD_PUBLISH_ENABLED","ZOEBUILD_HOSTED_PUBLISH_DEV","ZOEBUILD_HOSTED_FENCED_DEV","ZOEBUILD_HOSTED_FENCED_DEV_PROJECT","ZOEBUILD_HOSTED_PUBLISH_DEV_OWNER"])expect(allow({...input,env:{...env,[key]:undefined}})).toBe(false);expect(allow({...input,env:{...env,ZOEBUILD_PUBLISH_ENABLED:"1"}})).toBe(false);});
});
