import {describe, expect, it} from "vitest";
import {cloudWorkspaceFingerprint} from "../../projects/hooks/cloudWorkspaceFingerprint";
import {planRestoredCloudBaseline as plan} from "./v6RestoredCloudBaseline";
const args = {localFingerprint:"draft-A", cloudFingerprint:"draft-A",cachedVersion:3,cloudVersion:3};
describe("cloud baseline restoration after refresh", () => {
    it("accepts an unchanged cloud project after file IDs regenerate on refresh", () => {
        const cloud = {
            version: 2 as const, language: "python" as const,
            nodes: [
                {id:"folder-1",kind:"folder" as const,name:"src",parentId:null,createdAt:1,updatedAt:1},
                {id:"file-1",kind:"file" as const,name:"main.py",parentId:"folder-1",content:"print(123)",createdAt:1,updatedAt:1},
            ],
            entryFileId:"file-1",activeFileId:"file-1",openTabs:["file-1"], expanded:["folder-1"],leftPct:25,stdin:"",
        };
        const hydrated = {...cloud,
            nodes: [
                {...cloud.nodes[0],id:"fresh-folder"},
                {...cloud.nodes[1],id:"fresh-file",parentId:"fresh-folder"},
            ],
            entryFileId:"fresh-file",activeFileId:"fresh-file",openTabs:["fresh-file"],expanded:[],leftPct:40,
        };
        expect(plan({
            cachedVersion: 7,cloudVersion: 7,
            localFingerprint:cloudWorkspaceFingerprint(hydrated),
            cloudFingerprint:cloudWorkspaceFingerprint(cloud),
        })).toBe("clean");
    });
    it("acknowledges identical cloud data without creating a revision", () => {
        expect(plan(args)).toBe("clean");
    });
    it("fast-forwards safely when a newer revision has identical files", () => {
        expect(plan({...args,cloudVersion:4})).toBe("clean");
    });
    it("keeps local-only changes dirty if the version is unchanged", () => {
        expect(plan({...args,localFingerprint:"draft-B"})).toBe("local-draft");
    });
    it("does not mark newer conflicting cloud data saved", () => {
        expect(plan({...args,localFingerprint:"draft-B",cloudVersion:4})).toBe("conflict");
    });
    it("does not trust a baseline with unknown common version", () => {
        expect(plan({...args,localFingerprint:"draft-B",cachedVersion:null})).toBe("conflict");
    });
    it("rejects a cloud response older than the cached acknowledged revision", () => {
        expect(plan({...args,cloudVersion:2})).toBe("unverified");
    });
    it("never acknowledges an invalid or missing file tree", () => {
        expect(plan({...args, localFingerprint: "invalid-cloud-workspace:{}"})).toBe("unverified");
        expect(plan({...args, cloudFingerprint: "invalid-cloud-workspace:{}"})).toBe("unverified");
        expect(plan({...args, localFingerprint: "null"})).toBe("unverified");
    });
    it("rejects malformed cloud revisions", () => {
        expect(plan({...args,cloudVersion:0})).toBe("unverified");
        expect(plan({...args,cloudVersion:NaN})).toBe("unverified");
    });
});
