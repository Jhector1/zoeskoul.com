import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readRelative = (relativePath: string) =>
  readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );

const packageIdeHeader = readRelative(
  "../../../../../../../packages/learner-workspace/src/fullide/IdeHeader.tsx",
);

const appAdapter = readRelative(
  "../appAdapter.tsx",
);

const appHeaderAdapter = readRelative(
  "../../../HeaderSlick.tsx",
);

const sharedHeader = readRelative(
  "../../../../../../../packages/learner-ui/src/LearnerHeaderSlick.tsx",
);

const sandbox = readRelative(
  "../../../sandbox/ProgrammingSandbox.tsx",
);

describe("sandbox settings menu ownership", () => {
  it("reuses the canonical learner settings menu through the Web adapter and hides sound", () => {
    expect(sharedHeader).toContain("function SettingsMenu(");
    expect(sharedHeader).toContain("{showSound ? (");
    expect(appHeaderAdapter).toContain(
      "export const SettingsMenu = learnerHeader.SettingsMenu;",
    );
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

  it("keeps portal behavior in the canonical shared settings implementation", () => {
    expect(packageIdeHeader).toContain(
      "<FullIDESettingsMenu showSound={false} />",
    );
    expect(sharedHeader).toContain("createPortal(");
    expect(sharedHeader).toContain("document.body");
    expect(appHeaderAdapter).toContain("createPortal,");
  });

  it("enables the gear through the sandbox-only FullIDE prop", () => {
    expect(packageIdeHeader).toContain("showSettingsMenu ? (");
    expect(sandbox).toContain("showSettingsMenu");
  });
});
