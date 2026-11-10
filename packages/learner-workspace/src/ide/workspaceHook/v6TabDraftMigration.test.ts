import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadWorkspaceForLanguage } from "./workspace.persistence";
import { storageKeyForWorkspace, loadV2, saveV2 } from "@zoeskoul/learner-workspace/ide/storage";

vi.mock("@zoeskoul/learner-workspace/ide/storage", () => ({
  STORAGE_KEY_V2: "zoeskoul.ide.workspace.v2",
  storageKeyForWorkspace: vi.fn(({baseKey, actorKey, scopeKey, exerciseStateKey, localWorkspaceId, language}) =>
    [baseKey, actorKey, scopeKey, exerciseStateKey, localWorkspaceId, language].join("|")),
  legacyStorageKeyForWorkspace: vi.fn(({baseKey, actorKey, scopeKey, localWorkspaceId, language}) =>
    [baseKey, actorKey, scopeKey, localWorkspaceId, language].join("|")),
  loadV2: vi.fn(),
  saveV2: vi.fn(),
  tryMigrateV1: vi.fn(() => null),
}));

const args = {
  baseStorageKey: "v6:tab:new", next: "python" as const, draftStorageMode: "local" as const,
  actorKey: "user:alice", scopeKey: "sandbox", exerciseStateKey: "lessonA", localWorkspaceId: "workspace-A",
  legacyDraftBaseStorageKeys: ["v6:tab:inherited", "v5:shared"],
};
const stored = new Map<string, any>();
const state = {version: 2, language: "python", nodes: [], openTabs: [], expanded: [], activeFileId: "", entryFileId: "", stdin: "", leftPct: 25};
const keyFor = (baseKey: string, actorKey = "user:alice") => storageKeyForWorkspace({
    baseKey, actorKey, scopeKey: "sandbox", exerciseStateKey: "lessonA",
    localWorkspaceId: "workspace-A", language: "python",
});

beforeEach(() => {
    stored.clear(); vi.clearAllMocks();
    vi.mocked(loadV2).mockImplementation(async (key) => stored.get(key) ?? null);
    vi.mocked(saveV2).mockImplementation(async (key, value) => { stored.set(key, value); });
});

describe("V6 recoverable tab draft migration", () => {
    it("prefers the current tab over any older shared draft", async () => {
        const own = {...state, stdin: "current"};
        stored.set(keyFor(args.baseStorageKey), own);
        stored.set(keyFor("v5:shared"), {...state, stdin: "old"});
        expect(await loadWorkspaceForLanguage(args)).toBe(own);
        expect(saveV2).not.toHaveBeenCalled();
    });
    it("copies the inherited tab snapshot without removing its source", async () => {
        const older = {...state, stdin: "copied"};
        const key = keyFor("v6:tab:inherited");
        stored.set(key, older);
        expect(await loadWorkspaceForLanguage(args)).toBe(older);
        expect(stored.get(key)).toBe(older);
        expect(stored.get(keyFor(args.baseStorageKey))).toBe(older);
    });
    it("copies V5 draft when no tab version exists and leaves V5 untouched", async () => {
        const original = {...state, stdin: "v5"};
        stored.set(keyFor("v5:shared"), original);
        expect(await loadWorkspaceForLanguage(args)).toBe(original);
        stored.set(keyFor(args.baseStorageKey), {...state, stdin: "v6-updated"});
        expect(stored.get(keyFor("v5:shared"))).toBe(original);
    });
    it("does not import a different actor's draft", async () => {
        stored.set(keyFor("v5:shared", "user:bob"), {...state, stdin: "private"});
        expect(await loadWorkspaceForLanguage(args)).toBeNull();
    });
    it("never writes a draft when browser persistence is disabled", async () => {
        expect(await loadWorkspaceForLanguage({...args, draftStorageMode: "off"})).toBeNull();
        expect(loadV2).not.toHaveBeenCalled();
        expect(saveV2).not.toHaveBeenCalled();
    });
});
