import {describe, expect, it} from "vitest";
import {V6AcknowledgedEditJournal} from "./v6AcknowledgedEditJournal";

const file = (content: string) => ({kind:"file" as const,path:"notes.txt",content});

describe("V6 acknowledged edit journal", () => {
    it("never invents an edit from an unacknowledged draft", () => {
        const journal = new V6AcknowledgedEditJournal();
        expect(journal.drain("s1")).toEqual([]);
        journal.append("s1",{path:"notes.txt",before:file("a"),after:file("b")});
        expect(journal.drain("s1")).toEqual([{path:"notes.txt",before:file("a"),after:file("b")}]);
        expect(journal.drain("s1")).toEqual([]);
    });
    it("coalesces rapid same-path acknowledgements into a verified snapshot-compatible batch", () => {
        const journal = new V6AcknowledgedEditJournal();
        journal.append("s1",{path:"notes.txt",before:file("a"),after:file("b")});
        journal.append("s1",{path:"notes.txt",before:file("b"),after:file("c")});
        expect(journal.drain("s1")).toEqual([{path:"notes.txt",before:file("a"),after:file("c")}]);
    });
    it("discards all old-session acknowledgements on session switch", () => {
        const journal = new V6AcknowledgedEditJournal();
        journal.append("old",{path:"notes.txt",before:file("a"),after:file("b")});
        journal.reset("new");
        expect(journal.hasPending("old")).toBe(false);
        expect(journal.drain("new")).toEqual([]);
    });
    it("tracks partial success across later failed writes until verified", () => {
        const journal = new V6AcknowledgedEditJournal();
        journal.append("s1",{path:"notes.txt",before:file("a"),after:file("b")});
        expect(journal.hasPending("s1")).toBe(true);
        expect(journal.hasPending("s2")).toBe(false);
        expect(journal.drain("s1")).toHaveLength(1);
    });
});
