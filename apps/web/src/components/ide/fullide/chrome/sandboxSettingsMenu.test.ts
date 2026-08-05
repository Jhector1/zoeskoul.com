import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ideHeader = readFileSync(new URL("./IdeHeader.tsx", import.meta.url), "utf8");
const appHeader = readFileSync(new URL("../../../HeaderSlick.tsx", import.meta.url), "utf8");
const sandbox = readFileSync(new URL("../../../sandbox/ProgrammingSandbox.tsx", import.meta.url), "utf8");

describe("sandbox settings menu ownership", () => {
  it("reuses the app settings menu and hides sound", () => {
    expect(appHeader).toContain("export function SettingsMenu(");
    expect(appHeader).toContain("{showSound ? (");
    expect(ideHeader).toContain("<SettingsMenu showSound={false} />");
  });

  it("renders the menu through a document-body portal above the IDE", () => {
    expect(appHeader).toContain('import { createPortal } from "react-dom";');
    expect(appHeader).toContain("createPortal(");
    expect(appHeader).toContain("document.body");
    expect(appHeader).toContain("z-[9999]");
    expect(appHeader).toContain("panelRef.current?.contains(target)");
  });

  it("enables the gear through the sandbox-only FullIDE prop", () => {
    expect(ideHeader).toContain("showSettingsMenu ? (");
    expect(sandbox).toContain("showSettingsMenu");
  });
});
