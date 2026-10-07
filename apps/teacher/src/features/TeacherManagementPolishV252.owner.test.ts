import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cwd = path.resolve(process.cwd());
const teacherRoot = cwd.endsWith("/apps/teacher")
  ? cwd
  : path.resolve(cwd, "apps/teacher");

const source = (relativePath: string) =>
  fs.readFileSync(
    path.join(teacherRoot, relativePath),
    "utf8",
  );

const school = source(
  "src/features/school/TeacherSchoolPage.tsx",
);
const announcements = source(
  "src/features/announcements/TeacherAnnouncementsPanel.tsx",
);
const classes = source(
  "src/features/classes/TeacherClassesPage.tsx",
);

describe("Teacher management polish V252", () => {
  it("removes redundant Institution controls and guards Settings Save", () => {
    expect(school).toContain("schools.length > 1");
    expect(school).toContain("const settingsDirty");
    expect(school).toContain("const settingsValid");
    expect(school).toContain(
      "disabled={busy || !settingsDirty || !settingsValid}",
    );
  });

  it("keeps staff visible while collapsing invite creation by default", () => {
    expect(school).toContain(
      "const [inviteComposerOpen, setInviteComposerOpen] = useState(false)",
    );
    expect(school).toContain(
      't(inviteComposerOpen ? "invites.cancelComposer" : "invites.openComposer")',
    );
    expect(school).toContain("{inviteComposerOpen ? (");
    expect(school).toContain("pendingInvites.map");
  });

  it("collapses only the Institution announcement composer by default", () => {
    expect(school).toContain("collapseComposerByDefault");
    expect(announcements).toContain(
      "collapseComposerByDefault?: boolean;",
    );
    expect(announcements).toContain(
      "() => !props.collapseComposerByDefault",
    );
    expect(announcements).toContain(
      "props.canPublish && composerOpen",
    );
    expect(announcements).toContain(
      '"actions.openComposer"',
    );
    expect(announcements).toContain(
      '"actions.cancelComposer"',
    );
  });

  it("turns each class result into one whole-card link without nested class links", () => {
    expect(classes).toContain(
      'className="ui-surface block rounded-lg p-4 transition-colors',
    );
    expect(classes).toContain(
      'href={`/classes/${group.id}`}',
    );
    expect(classes).not.toContain(
      'className="truncate font-medium hover:underline"',
    );
    expect(classes).not.toContain(
      'className="text-sm font-medium hover:underline"',
    );
  });

  it("keeps destructive lifecycle controls secondary", () => {
    const workspace = source(
      "src/features/classes/TeacherClassWorkspace.tsx",
    );
    expect(workspace).toContain(
      'className="ui-btn-secondary h-9 px-4"',
    );
    expect(workspace).toContain(
      'onClick={() => void changeStatus("closed")}',
    );
  });
});
