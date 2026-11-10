import {describe, expect, it} from "vitest";
import {getOrCreateCreationIntent, clearAcknowledgedCreationIntent} from "./v6CreationIntent";

function memoryStorage() {
    const data = new Map<string,string>();
    return {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => { data.set(key,value); },
        removeItem: (key: string) => { data.delete(key); },
    };
}
const key = "draft-a:create-intent:v1";
const token = "c8d5fb8f-6b55-4e26-8a80-47ab0ae8f2a2";
describe("durable cloud creation intent", () => {
    it("reuses one key after a lost response or refreshed mount", () => {
        const storage = memoryStorage();
        expect(getOrCreateCreationIntent(storage,key,()=>token)).toBe(token);
        expect(getOrCreateCreationIntent(storage,key,()=>{throw new Error("regenerated");})).toBe(token);
    });
    it("clears only the acknowledged intent", () => {
        const storage = memoryStorage();
        getOrCreateCreationIntent(storage,key,()=>token);
        clearAcknowledgedCreationIntent(storage,key,"other");
        expect(storage.getItem(key)).toBe(token);
        clearAcknowledgedCreationIntent(storage,key,token);
        expect(storage.getItem(key)).toBe(null);
    });
    it("refuses untracked creates when storage fails", () => {
        expect(()=>getOrCreateCreationIntent(null,key,()=>token)).toThrow(/storage is unavailable/i);
        expect(()=>getOrCreateCreationIntent({getItem:()=>null,setItem:()=>{throw new Error("quota");}},key,()=>token)).toThrow("quota");
    });
});
