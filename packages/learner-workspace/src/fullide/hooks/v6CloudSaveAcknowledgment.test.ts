import {describe, expect, it} from "vitest";
import {isValidCloudSaveAcknowledgment} from "./v6CloudSaveAcknowledgment";
const ok = {ok:true, project:{id:"new", currentVersion:1, updatedAt:"2026-11-09T12:00:00.000Z"}};
describe("cloud save acknowledgment", () => {
    it("accepts a valid newly created copy", () => {
        expect(isValidCloudSaveAcknowledgment(ok, null, "old")).toBe(true);
        expect(isValidCloudSaveAcknowledgment(ok, null, "new")).toBe(false);
    });
    it("accepts an update only for the requested project", () => {
        expect(isValidCloudSaveAcknowledgment(ok, "new")).toBe(true);
        expect(isValidCloudSaveAcknowledgment(ok, "old")).toBe(false);
    });
    it("rejects malformed or unconfirmed responses", () => {
        expect(isValidCloudSaveAcknowledgment(null, null)).toBe(false);
        expect(isValidCloudSaveAcknowledgment({ok:false, project:ok.project}, null)).toBe(false);
        expect(isValidCloudSaveAcknowledgment({ok:true, project:{...ok.project, id:""}}, null)).toBe(false);
        expect(isValidCloudSaveAcknowledgment({ok:true, project:{...ok.project, currentVersion:0}}, null)).toBe(false);
        expect(isValidCloudSaveAcknowledgment({ok:true, project:{...ok.project, updatedAt:""}}, null)).toBe(false);
        expect(isValidCloudSaveAcknowledgment({ok:true, project:{...ok.project, updatedAt:"not-a-date"}}, null)).toBe(false);
    });
});
