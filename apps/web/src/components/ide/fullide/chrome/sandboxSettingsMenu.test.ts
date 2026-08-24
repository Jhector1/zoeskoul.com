import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageIdeHeader = readFileSync(
  resolve(
    process.cwd(),
    "../../packages/learner-workspace/src/fullide/IdeHeader.tsx",
  ),
  "utf8",
);

const appAdapter = readFileSync(
  resolve(process.cwd(), "src/components/ide/fullide/appAdapter.tsx"),
  "utf8",
);

const appHeader = readFileSync(
  resolve(process.cwd(), "src/components/HeaderSlick.tsx"),
  "utf8",
);

const sandbox = readFileSync(
  resolve(process.cwd(), "src/components/sandbox/ProgrammingSandbox.tsx"),
  "utf8",
);

describe("sandbox settings menu ownership", () => {
  it("reuses the Web app settings menu and hides sound", () => {
    expect(appHeader).toContain("export function SettingsMenu(");
    expect(appHeader).toContain("{showSound ? (");
    expect(appAdapter).toContain(
      'import { SettingsMenu } from "@/components/HeaderSlick";',
    );
    expect(appAdapter).toContain(
      "export const FullIDESettingsMenu = SettingsMenu;",
    );
    expect(packageIdeHeader).toContain(
      "<FullIDESettingsMenu showSound={false} />",
    );
  });

  it("keeps portal behavior in the injected Web settings implementation", () => {
    expect(packageIdeHeader).toContain(
      "<FullIDESettingsMenu showSound={false} />",
    );
    expect(appHeader).toContain("createPortal(");
    expect(appHeader).toContain("document.body");
  });

  it("enables the gear through the sandbox-only FullIDE prop", () => {
    expect(packageIdeHeader).toContain("showSettingsMenu ? (");
    expect(sandbox).toContain("showSettingsMenu");
  });
});
