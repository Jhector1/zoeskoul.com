import { describe, expect, it } from "vitest";
import { allowsTanstackPublishPilot } from "./tanstackPublishPilotPolicy";
const input = {origin:"http://localhost:3004",projectId:"project1",sourceVersion:3,canPublish:true,
  env:{NODE_ENV:"development",ZOEBUILD_PUBLISH_ENABLED:"0",ZOEBUILD_PRIVATE_PUBLISH_PILOT:"project1:3"}};
describe("private TanStack publish pilot",()=>{
  it("admits only an exact operator-selected local project revision with publishing entitlement",()=>{
    expect(allowsTanstackPublishPilot(input)).toBe(true);
    expect(allowsTanstackPublishPilot({...input,origin:"http://127.0.0.1:3004"})).toBe(true);
  });
  it.each([{origin:"https://zoeskoul.com"},{origin:"http://localhost:3005"},{sourceVersion:4},{projectId:"project2"},{canPublish:false}])("rejects an unauthorized input",change=>{
    expect(allowsTanstackPublishPilot({...input,...change})).toBe(false);
  });
  it("allows an explicit local operator-selected owner without a paid entitlement",()=>{
    const selected = {...input,userId:"owner1",canPublish:false,env:{...input.env,ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER:"owner1"}};
    expect(allowsTanstackPublishPilot(selected)).toBe(true);
    expect(allowsTanstackPublishPilot({...selected,userId:"other1"})).toBe(false);
    expect(allowsTanstackPublishPilot({...selected,userId:"other1",canPublish:true})).toBe(false);
    expect(allowsTanstackPublishPilot({...selected,userId:null})).toBe(false);
    expect(allowsTanstackPublishPilot({...selected,sourceVersion:4})).toBe(false);
    expect(allowsTanstackPublishPilot({...selected,origin:"https://zoeskoul.com"})).toBe(false);
    expect(allowsTanstackPublishPilot({...selected,env:{...selected.env,NODE_ENV:"production"}})).toBe(false);
    expect(allowsTanstackPublishPilot({...selected,env:{...selected.env,ZOEBUILD_PUBLISH_ENABLED:"1"}})).toBe(false);
    expect(allowsTanstackPublishPilot({...selected,env:{...selected.env,ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER:""}})).toBe(false);
  });
  it.each([{NODE_ENV:"production"},{ZOEBUILD_PUBLISH_ENABLED:"1"},{ZOEBUILD_PUBLISH_ENABLED:undefined},{ZOEBUILD_PRIVATE_PUBLISH_PILOT:undefined}])("fails closed on public or absent flags",change=>{
    expect(allowsTanstackPublishPilot({...input,env:{...input.env,...change}})).toBe(false);
  });
});
