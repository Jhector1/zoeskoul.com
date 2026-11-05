import { describe, expect, it } from "vitest";
import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { decideTanstackPreviewSync } from "./tanstackPreviewSyncDecision";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = (content: string): WorkspaceSyncEntry =>
  ({kind: "file", path: "src/routes/index.tsx", content});
const saved = [file("saved")];
function decide(overrides: Partial<Parameters<typeof decideTanstackPreviewSync>[0]> = {}) {
  return decideTanstackPreviewSync({
    sessionSourceVersion: 12, selectedSourceVersion: 12,
    sessionEntries: saved, selectedEntries: saved, hasUnsavedChanges: false,
    ...overrides,
  });
}

describe("TanStack immutable preview decision", () => {
  it("keeps only the exact signed saved-source lease", () => {
    expect(decide()).toBe("unchanged");
    expect(decide({selectedSourceVersion: 13})).toBe("restart");
    expect(decide({selectedEntries: [file("changed")]})).toBe("restart");
  });
  it("never uploads unsaved code or restarts a signed lease for a dirty buffer", () => {
    expect(decide({hasUnsavedChanges: true, selectedEntries: [file("unsaved")]})).toBe("hold");
    expect(decide({hasUnsavedChanges: true, selectedSourceVersion: 13})).toBe("hold");
  });
  it("uses restart/cancel/start instead of sending source to the retired sync endpoint", () => {
    const hook = readFileSync(fileURLToPath(new URL("../../components/builder/useReactVitePreview.ts", import.meta.url)),"utf8");
    const start = hook.indexOf("const syncCurrent = useCallback");
    const end = hook.indexOf("const start = useCallback", start);
    const sync = hook.slice(start, end);
    expect(sync).toContain("decideTanstackPreviewSync");
    expect(sync).toContain('throw new Error("PREVIEW_RESTART_REQUIRED")');
    expect(sync).not.toContain("/sync");
    expect(hook).toContain("await cancelCurrent();");
    expect(hook).toContain("await start();");
  });
  it("enables the TanStack browser preview and keeps legacy history gated off", () => {
    const shell = readFileSync(fileURLToPath(new URL("../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx", import.meta.url)),"utf8");
    expect(shell).toContain('const reactPreviewEnabled =\n    props.project.stackId === "tanstack-start-v1"');
    expect(shell).toContain('props.project.stackId === "react-vite-v1" ? (');
    expect(shell).toContain("confirmedSourceVersion !== previewSourceVersion");
  });
});
