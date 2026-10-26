import {webcrypto} from "node:crypto";
import {describe, expect, it} from "vitest";
import {getOrCreateAiBrowserAttempt, completeAiBrowserAttempt,
  type AiBrowserStorage} from "./aiBrowserAttemptRecovery";

const base = {
  projectId: "project_1", sourceVersion: 4,
  prompt: "Move Our Approach to /approach", files: [],
  previousInstructions: ["Prior user choice"],
  conversation: [JSON.stringify({role:"user",text:"Our Approach page"})],
  uuid: () => "8d352d31-5185-4b22-b670-f8edc0674e13",
};
function storage():AiBrowserStorage {
  const data = new Map<string,string>();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);},
    removeItem:key=>{data.delete(key);}};
}
// Node 20+ offers WebCrypto; keep Vitest's environment support explicit.
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis,"crypto",{value:webcrypto,configurable:true});

describe("V12K3B actual AI browser-attempt recovery",()=>{
  it("replays the exact original conversation, ignoring newer chat after refresh",async()=>{
    const mem=storage();
    const first=await getOrCreateAiBrowserAttempt({...base,storage:mem,now:1000000});
    const replay=await getOrCreateAiBrowserAttempt({...base,storage:mem,now:1000001,
      conversation:[JSON.stringify({role:"assistant",text:"Later response"})]});
    expect(replay).toMatchObject({recovered:true,id:first.id,conversation:base.conversation});
  });
  it("can complete only its own matching attempt",async()=>{
    const mem=storage();
    const first=await getOrCreateAiBrowserAttempt({...base,storage:mem,now:1000000});
    completeAiBrowserAttempt({storage:mem,projectId:base.projectId,id:first.id});
    const after=await getOrCreateAiBrowserAttempt({...base,storage:mem,now:1000001,
      uuid:()=>"ce78ae1f-df50-49f6-9a20-a8789d2f7a0c"});
    expect(after.recovered).toBe(false);
    expect(after.id).not.toBe(first.id);
  });
  it("rejects malformed conversation input before writing the attempt",async()=>{
    const mem=storage();
    await expect(getOrCreateAiBrowserAttempt({...base,storage:mem,
      conversation:["x".repeat(1001)]})).rejects.toThrow("AI_ATTEMPT_CONVERSATION_INVALID");
  });
});
