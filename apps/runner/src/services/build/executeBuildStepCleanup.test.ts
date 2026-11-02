import {beforeEach,describe,expect,it,vi} from "vitest";
const state = vi.hoisted(() => ({
  actions: [] as string[], failRemove: false,
}));
vi.mock("../docker/dockerClient.js",()=>({ docker: {
  createContainer: async () => ({
    id: "a".repeat(64),
    start: async () => {state.actions.push("start");},
    wait: async () => ({StatusCode:0}),
    remove: async () => {
      state.actions.push("remove");
      if (state.failRemove) throw Error("daemon unavailable");
    },
  }),
}}));
import {executeBuildStep} from "./executeProductionBuild.js";
beforeEach(()=>{state.actions=[];state.failRemove=false;});
describe("trusted build step strict cleanup hooks",()=>{
  it("journals the container before execution and confirms teardown after removal",async()=>{
    await executeBuildStep({workspaceDir:"/tmp/test",step:"install",command:["pnpm","install"],
      strictCleanup:true,tanstackRunId:"test-run",
      onContainerCreated:async()=>{state.actions.push("journal-create");},
      onContainerRemoved:async()=>{state.actions.push("journal-clear");},
    });
    expect(state.actions).toEqual(["journal-create","start","remove","journal-clear"]);
  });
  it("keeps the journal bound when Docker refuses removal",async()=>{
    state.failRemove=true;
    await expect(executeBuildStep({workspaceDir:"/tmp/test",step:"install",command:["pnpm","install"],
      strictCleanup:true,
      onContainerCreated:async()=>{state.actions.push("journal-create");},
      onContainerRemoved:async()=>{state.actions.push("journal-clear");},
    })).rejects.toThrow("daemon unavailable");
    expect(state.actions).toEqual(["journal-create","start","remove"]);
  });
});
