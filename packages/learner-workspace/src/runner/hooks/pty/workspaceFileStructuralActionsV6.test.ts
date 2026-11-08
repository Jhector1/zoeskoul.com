import { describe, expect, it, vi } from "vitest";
import { WorkspaceFileV6Error, type WorkspaceFileV6Operation,
    type WorkspaceFileV6Success } from "./workspaceFileClientV6";
import { WorkspaceStructuralActionsV6 } from "./workspaceFileStructuralActionsV6";

const sha = `sha256:${"a".repeat(64)}`;
const staleSha = `sha256:${"b".repeat(64)}`;
const trashId = "0123456789abcdef0123456789abcdef";
const response = (payload: Record<string, unknown>) => ({ ok: true as const, ...payload });

type Reply = WorkspaceFileV6Success;
function setup(routes: Partial<Record<WorkspaceFileV6Operation["op"], Reply>> = {}, clean = () => true) {
    const sent: WorkspaceFileV6Operation[] = [];
    const transport = vi.fn(async (_session: string, op: WorkspaceFileV6Operation) => {
        sent.push(op);
        const found = routes[op.op];
        if (!found) throw new WorkspaceFileV6Error("NOT_FOUND", 404);
        return found;
    });
    return { sent, transport, coordinator: new WorkspaceStructuralActionsV6("session", clean, transport) };
}

describe("V6B4e4c explicit file and folder action bridge", () => {
    it("rejects dirty drafts before any request", async () => {
        const t = setup({ mkdir: response({ created: true }) }, () => false);
        await expect(t.coordinator.execute({ kind: "mkdir", path: "src/x" })).rejects.toMatchObject({ code: "LOCAL_DRAFT_CHANGED" });
        expect(t.sent).toEqual([]);
    });
    it("creates a folder only if the parent listing confirms the leaf is absent", async () => {
        const t = setup({ list: response({ entries: [] }), mkdir: response({ created: true }) });
        await expect(t.coordinator.execute({ kind: "mkdir", path: "src/assets" })).resolves.toMatchObject({ state: "reconciliation_required" });
        expect(t.sent).toEqual([{ op: "list", path: "src" }, { op: "mkdir", path: "src/assets" }]);
    });
    it("refuses to create over an existing folder", async () => {
        const t = setup({ list: response({ entries: [{ name: "assets", kind: "directory", size: 0 }] }), mkdir: response({ created: true }) });
        await expect(t.coordinator.execute({ kind: "mkdir", path: "src/assets" })).rejects.toMatchObject({ code: "CONFLICT" });
        expect(t.sent).toHaveLength(1);
    });
    it("removes only empty folders using worker-enforced rmdir", async () => {
        const t = setup({ rmdir: response({ deleted: true }) });
        await t.coordinator.execute({ kind: "rmdir", path: "src/empty" });
        expect(t.sent).toEqual([{ op: "rmdir", path: "src/empty", expectedRevision: null }]);
    });
    it("preflights file revision and destination before atomic no-overwrite move", async () => {
        const t = setup({ read: response({ revision: sha }), list: response({ entries: [] }),
            move: response({ moved: true, kind: "file" }) });
        await t.coordinator.execute({ kind: "move_file", path: "src/a.txt", destinationPath: "src/b.txt", expectedRevision: sha });
        expect(t.sent).toEqual([
            { op: "read", path: "src/a.txt" }, { op: "list", path: "src" },
            { op: "move", path: "src/a.txt", destinationPath: "src/b.txt", expectedRevision: sha },
        ]);
    });
    it("stale file revision prevents any move mutation", async () => {
        const t = setup({ read: response({ revision: staleSha }) });
        await expect(t.coordinator.execute({ kind: "move_file", path: "src/a.txt", destinationPath: "src/b.txt", expectedRevision: sha }))
            .rejects.toMatchObject({ code: "CONFLICT" });
        expect(t.sent).toHaveLength(1);
    });
    it("moves nonempty folder with the exact inspected revision", async () => {
        const t = setup({ inspect: response({ revision: sha }), list: response({ entries: [] }),
            move_directory: response({ moved: true, kind: "directory" }) });
        await t.coordinator.execute({ kind: "move_directory", path: "src", destinationPath: "renamed" });
        expect(t.sent.at(-1)).toEqual({ op: "move_directory", path: "src", destinationPath: "renamed", expectedRevision: sha });
    });
    it("never moves a folder beneath itself", async () => {
        const t = setup();
        await expect(t.coordinator.execute({ kind: "move_directory", path: "src", destinationPath: "src/nested" }))
            .rejects.toMatchObject({ code: "INVALID_PATH" });
        expect(t.sent).toEqual([]);
    });
    it("trashes only after an inspect, and returns opaque recovery ID", async () => {
        const t = setup({ inspect: response({ revision: sha }),
            trash_directory: response({ trashed: true, trashId }) });
        const outcome = await t.coordinator.execute({ kind: "trash_directory", path: "src" });
        expect(outcome.trashId).toBe(trashId);
        expect(t.sent).toEqual([{ op: "inspect", path: "src" }, { op: "trash_directory", path: "src", expectedRevision: sha }]);
    });
    it("validates trash listing and refuses a mismatched restoration token", async () => {
        const t = setup({ list_trash: response({ entries: [{ originalPath: "other", trashId }] }) });
        await expect(t.coordinator.execute({ kind: "restore_directory", path: "src", trashId })).rejects.toMatchObject({ code: "CONFLICT" });
        expect(t.sent).toHaveLength(1);
    });
    it("restores only the matching token to an absent destination", async () => {
        const t = setup({ list_trash: response({ entries: [{ originalPath: "src", trashId }] }),
            list: response({ entries: [] }), restore_directory: response({ restored: true }) });
        await t.coordinator.execute({ kind: "restore_directory", path: "src", trashId });
        expect(t.sent.at(-1)).toEqual({ op: "restore_directory", path: "src", trashId, expectedRevision: null });
    });
    it("rejects unknown paths and invalid revisions before the network", async () => {
        const t = setup();
        await expect(t.coordinator.execute({ kind: "mkdir", path: "../secret" })).rejects.toMatchObject({ code: "INVALID_PATH" });
        await expect(t.coordinator.execute({ kind: "move_file", path: "a.txt", destinationPath: "b.txt", expectedRevision: "invalid" })).rejects.toMatchObject({ code: "INVALID_REVISION" });
        expect(t.sent).toEqual([]);
    });
    it("does not retry a network failure or fall back to V5", async () => {
        const t = setup({ inspect: response({ revision: sha }) });
        await expect(t.coordinator.execute({ kind: "trash_directory", path: "src" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(t.sent.map((op) => op.op)).toEqual(["inspect", "trash_directory"]);
    });
    it("disposed sessions cannot perform new operations", async () => {
        const t = setup(); t.coordinator.dispose();
        await expect(t.coordinator.execute({ kind: "rmdir", path: "src" })).rejects.toMatchObject({ code: "SESSION_DISPOSED" });
        expect(t.sent).toEqual([]);
    });
});
