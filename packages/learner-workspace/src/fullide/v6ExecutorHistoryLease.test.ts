import {describe, expect, it} from "vitest";
import {planV6ExecutorHistoryPublication as transition, v6FileActionLabel} from "./v6ExecutorHistoryLease";

describe("V6 session-bound Undo history and progress", () => {
    it("keeps history when readiness briefly drops during a delete", () => {
        const connected = transition(null,"sess_A",true);
        expect(connected).toEqual({sessionId:"sess_A",resetHistory:true,acceptExecutor:true});
        const offline = transition(connected.sessionId,"sess_A",false);
        expect(offline).toEqual({sessionId:"sess_A",resetHistory:false,acceptExecutor:false});
        const reattached = transition(offline.sessionId,"sess_A",true);
        expect(reattached).toEqual({sessionId:"sess_A",resetHistory:false,acceptExecutor:true});
    });
    it("clears an old session's history before accepting a different terminal", () => {
        expect(transition("sess_A","sess_B",true)).toEqual({sessionId:"sess_B",resetHistory:true,acceptExecutor:true});
    });
    it("fails closed if the executor has no proven session identity", () => {
        expect(transition("sess_A",null,true)).toEqual({sessionId:null,resetHistory:true,acceptExecutor:false});
    });
    it("shows specific progress for delete, rename, restore and download", () => {
        expect(v6FileActionLabel({kind:"delete_file",path:"src/notes.txt"})).toBe("Deleting notes.txt…");
        expect(v6FileActionLabel({kind:"move_file",path:"src/notes.txt",destinationPath:"src/n.txt"})).toBe("Moving or renaming notes.txt…");
        expect(v6FileActionLabel({kind:"restore_directory",path:"testfolder",trashId:"a".repeat(32)})).toBe("Restoring testfolder…");
        expect(v6FileActionLabel({kind:"export_snapshot",path:""})).toBe("Preparing download…");
    });
});
