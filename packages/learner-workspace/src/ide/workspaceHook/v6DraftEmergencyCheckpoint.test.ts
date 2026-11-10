import {describe,it,expect} from "vitest";
import {encodeEmergencyDraft,parseEmergencyDraft,shouldRestoreEmergencyDraft,emergencyDraftKey} from "./v6DraftEmergencyCheckpoint";

const ws={version:2,language:"python",nodes:[],entryFileId:"main"} as any;
describe("local emergency draft checkpoint",()=>{
    it("roundtrips a small current draft without losing content",()=>{
        const encoded=encodeEmergencyDraft(ws,150);
        expect(parseEmergencyDraft(encoded)?.workspace).toEqual(ws);
        expect(emergencyDraftKey("a")).toBe("a:emergency:v1");
    });
    it("uses checkpoint only when newer than an acknowledged IndexedDB write",()=>{
        const checkpoint=parseEmergencyDraft(encodeEmergencyDraft(ws,150));
        expect(shouldRestoreEmergencyDraft(checkpoint,149)).toBe(true);
        expect(shouldRestoreEmergencyDraft(checkpoint,150)).toBe(false);
        expect(shouldRestoreEmergencyDraft(checkpoint,151)).toBe(false);
    });
    it("rejects corrupt and oversized checkpoints safely",()=>{
        expect(parseEmergencyDraft("broken")).toBeNull();
        expect(parseEmergencyDraft('{"marker":"other"}')).toBeNull();
        expect(encodeEmergencyDraft({...ws,nodes:[{content:"x".repeat(450000)}]},123)).toBeNull();
    });
});
