import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {canHydratePrivatePublishing} from "./privatePublishHydration";
const project={buildProjectId:"project1",status:"draft",stackId:"tanstack-start-v1"};
const env={NODE_ENV:"development",ZOEBUILD_PUBLISH_ENABLED:"0",ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION:"1",ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION_PROJECT:"project1",ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER:"owner1"};
describe("private publishing hydration eligibility",()=>{
 it("allows the selected owned project",()=>expect(canHydratePrivatePublishing(project,"owner1",env)).toBe(true));
 it("rejects all other projects, owners and anonymous users",()=>{
  expect(canHydratePrivatePublishing({...project,buildProjectId:"project2"},"owner1",env)).toBe(false);
  expect(canHydratePrivatePublishing(project,"owner2",env)).toBe(false);
  expect(canHydratePrivatePublishing(project,null,env)).toBe(false);
 });
 it("rejects archived and unsupported projects",()=>{
  expect(canHydratePrivatePublishing({...project,status:"archived"},"owner1",env)).toBe(false);
  expect(canHydratePrivatePublishing({...project,stackId:"react-v1"},"owner1",env)).toBe(false);
  expect(canHydratePrivatePublishing({...project,stackId:null},"owner1",env)).toBe(false);
 });
 it("fails closed without the explicit private lane",()=>{
  for(const override of [{NODE_ENV:"production"},{ZOEBUILD_PUBLISH_ENABLED:"1"},{ZOEBUILD_PRIVATE_PUBLISH_AUTOMATION:"0"},{ZOEBUILD_PRIVATE_PUBLISH_PILOT_OWNER:""}])
   expect(canHydratePrivatePublishing(project,"owner1",{...env,...override})).toBe(false);
 });
});
