import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

const header = readFileSync(
  new URL("./TeacherHeader.tsx", import.meta.url),
  "utf8",
);

const shell = readFileSync(
  new URL("./TeacherAppShell.tsx", import.meta.url),
  "utf8",
);

describe("Teacher global header ownership", () => {
  it("reuses shared HeaderChrome instead of forking header geometry", () => {
    expect(header).toContain(
      'from "@zoeskoul/learner-ui"',
    );
    expect(header).toContain("<HeaderChrome");
    expect(header).not.toContain(
      '<header className="sticky top-0 z-50">',
    );
  });

  it("uses the simplified Teacher destinations", () => {
    for (const href of [
      'href: "/"',
      'href: "/classes"',
      'href: "/tutoring"',
      'href: "/institution"',
    ]) {
      expect(header).toContain(href);
    }

    for (const oldGlobalRoute of [
      'href: "/assignments"',
      'href: "/reports"',
      'href: "/school"',
    ]) {
      expect(header).not.toContain(oldGlobalRoute);
    }
  });

  it("uses canonical shared header chrome without a Teacher-only elevated surface", () => {
    expect(header).toContain("HeaderChrome");
    expect(header).not.toContain("<HeaderChrome\\n      elevated");
    expect(header).not.toContain("bg-white");
    expect(header).not.toContain("dark:bg-neutral");
  });

  it("keeps routing in the Teacher adapter and all header copy in i18n", () => {
    expect(header).toContain("TeacherLink");
    expect(header).toContain('"Teacher.header"');
    expect(header).toContain("websiteOrigin");
    expect(header).not.toContain("window.history");
  });

  it("renders the global header around every routed Teacher surface", () => {
    expect(shell).toContain("<TeacherHeader");
    expect(shell).toContain("const location =");
    expect(shell).toContain("let content;");
    expect(shell).toContain("{content}");
    expect(shell).toContain("headerSection(");
  });

  it("routes root to Home and class creation to the guided wizard", () => {
    expect(shell).toContain("TeacherHomePage");
    expect(shell).toContain("TeacherClassCreateWizard");
    expect(shell).toContain("TeacherClassWorkspace");
    expect(shell).not.toContain("<TeacherClassDashboard");
  });
});

const teacherStyles = readFileSync(
  new URL("../styles.css", import.meta.url),
  "utf8",
);

describe("Teacher shared style ownership", () => {
  it("loads canonical ZoeSkoul tokens/components and scans shared HeaderChrome", () => {
    expect(teacherStyles).toContain("packages/ui-styles/ui.css");
    expect(teacherStyles).not.toContain("packages/ui-styles/colors.css");
    expect(teacherStyles).not.toContain("packages/ui-styles/ui-v2.css");
    expect(teacherStyles).toContain("packages/learner-ui/src");
    expect(teacherStyles).not.toContain("teacher-ui-v2.css");
    expect(teacherStyles).not.toContain("TeacherHeader.css");
  });
});
