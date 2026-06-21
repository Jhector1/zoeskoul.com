import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, any>;

const WEB_ROOT = fs.existsSync(path.resolve(process.cwd(), "src"))
  ? process.cwd()
  : path.resolve(process.cwd(), "apps/web");

const SUBJECT_ROOT = path.join(
  WEB_ROOT,
  "src/lib/subjects/linux/linux-terminal-fundamentals",
);

function readJson(filePath: string): JsonObject {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
}

function topicPath(moduleNumber: number, topicSlug: string) {
  return path.join(
    SUBJECT_ROOT,
    `modules/module${moduleNumber}/topics/${topicSlug}/topic.bundle.json`,
  );
}

function getExercise(topic: JsonObject, exerciseId: string) {
  return (topic.exercises ?? []).find((exercise: JsonObject) => exercise.id === exerciseId);
}

function starterPaths(exercise: JsonObject) {
  return (exercise?.starterFiles ?? [])
    .map((file: JsonObject) => String(file?.path ?? ""))
    .filter(Boolean)
    .sort();
}

function listTopicBundlePaths() {
  return fs
    .readdirSync(path.join(SUBJECT_ROOT, "modules"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((moduleEntry) => {
      const topicsRoot = path.join(SUBJECT_ROOT, "modules", moduleEntry.name, "topics");
      return fs
        .readdirSync(topicsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((topicEntry) => path.join(topicsRoot, topicEntry.name, "topic.bundle.json"));
    });
}

describe("linux terminal fundamentals content", () => {
  it("uses per-exercise terminal sessions for Linux terminal workspaces", () => {
    for (const bundlePath of listTopicBundlePaths()) {
      const topic = readJson(bundlePath);

      if (topic.serviceDefaults?.layoutMode !== "terminal_workspace") continue;

      expect(topic.serviceDefaults?.runnerBackend).toBe("pty");
      expect(topic.serviceDefaults?.terminalSessionScope).toBe("exercise");
    }
  });

  it("uses terminalExpectations for output-only command practice", () => {
    const whereAmI = readJson(topicPath(1, "where-am-i"));
    const viewingFileContents = readJson(topicPath(2, "viewing-file-contents"));

    expect(whereAmI.serviceDefaults?.layoutMode).toBe("terminal_workspace");
    expect(whereAmI.serviceDefaults?.terminalSessionScope).toBe("exercise");
    expect(viewingFileContents.serviceDefaults?.layoutMode).toBe("terminal_workspace");
    expect(viewingFileContents.serviceDefaults?.terminalSessionScope).toBe("exercise");

    expect(getExercise(whereAmI, "ci-create-navigation-lab")).toMatchObject({
      kind: "code_input",
      language: "bash",
      recipe: {
        type: "shell_task",
        mode: "terminal_workspace",
      },
      terminalExpectations: {
        requiredCommands: [{ pattern: "^pwd$" }],
        outputRegex: ["/workspace"],
      },
    });

    expect(getExercise(whereAmI, "ci-create-visible-hidden-practice")).toMatchObject({
      terminalExpectations: {
        requiredCommands: [{ pattern: "^ls\\s+campus$" }],
        outputContains: ["map.txt", "room.txt"],
      },
    });

    expect(getExercise(whereAmI, "ci-create-long-list-lab")).toMatchObject({
      terminalExpectations: {
        requiredCommands: [{ pattern: "^ls\\s+-a\\s+campus$" }],
        outputContains: [".room-number"],
      },
    });

    expect(getExercise(viewingFileContents, "ci-create-log-review")).toMatchObject({
      terminalExpectations: {
        requiredCommands: [{ pattern: "^cat\\s+messages/welcome\\.txt$" }],
        outputContains: ["Welcome to the file review desk."],
      },
    });

    expect(getExercise(viewingFileContents, "ci-create-notes-summary")).toMatchObject({
      terminalExpectations: {
        requiredCommands: [
          { pattern: "^head\\s+reports/week\\.txt$" },
          { pattern: "^tail\\s+logs/server\\.log$" },
        ],
        outputContains: ["Monday", "finish ok"],
      },
    });

    expect(getExercise(viewingFileContents, "ci-create-count-marker")).toMatchObject({
      terminalExpectations: {
        requiredCommands: [{ pattern: "^wc\\s+-l\\s+reports/week\\.txt$" }],
        outputRegex: ["^\\s*5\\s+reports/week\\.txt$"],
      },
    });
  });

  it("keeps file-changing practice on workspaceExpectations", () => {
    const creatingFolders = readJson(topicPath(2, "creating-folders-and-files"));
    const copyMoveRename = readJson(topicPath(2, "copy-move-rename"));

    expect(getExercise(creatingFolders, "ci-create-school-notes")).toMatchObject({
      recipe: {
        type: "shell_task",
        mode: "terminal_workspace",
      },
      workspaceExpectations: {
        requiredFiles: expect.any(Array),
      },
    });
    expect(getExercise(creatingFolders, "ci-create-school-notes")?.terminalExpectations).toBeUndefined();

    expect(getExercise(copyMoveRename, "ci-copy-draft")).toMatchObject({
      recipe: {
        type: "shell_task",
        mode: "terminal_workspace",
      },
      workspaceExpectations: {
        requiredFiles: expect.any(Array),
      },
    });
    expect(getExercise(copyMoveRename, "ci-copy-draft")?.terminalExpectations).toBeUndefined();
  });
  it("final project exercises start from the workspace their prompt describes", () => {
    const organizer = readJson(topicPath(2, "module-2-notes-organizer-project"));
    const capstone = readJson(topicPath(3, "final-file-room-capstone"));

    const organizerFinal = getExercise(organizer, "ci-organizer-final");
    expect(starterPaths(organizerFinal)).toEqual([
      "README.md",
      "downloads/old.tmp",
      "main.sh",
      "semester/assignments/homework.txt",
      "semester/notes/notes.txt",
      "semester/scripts/project.sh",
    ]);
    expect(starterPaths(organizerFinal)).not.toContain("downloads/notes.txt");
    expect(starterPaths(organizerFinal)).not.toContain("downloads/homework.txt");
    expect(starterPaths(organizerFinal)).not.toContain("downloads/project.sh");

    const capstoneFinal = getExercise(capstone, "ci-capstone-finish-handoff");
    expect(starterPaths(capstoneFinal)).toEqual([
      "README.md",
      "event-room/archive/guests.txt",
      "event-room/incoming/old.tmp",
      "event-room/notes/agenda.txt",
      "event-room/scripts/setup.sh",
      "main.sh",
    ]);
    expect(starterPaths(capstoneFinal)).not.toContain("event-room/incoming/agenda.txt");
    expect(starterPaths(capstoneFinal)).not.toContain("event-room/incoming/setup.sh");
    expect(starterPaths(capstoneFinal)).not.toContain("event-room/incoming/guest-list.txt");
  });

});
