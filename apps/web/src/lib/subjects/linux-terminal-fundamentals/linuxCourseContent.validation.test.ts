import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, any>;

const WEB_ROOT = fs.existsSync(path.resolve(process.cwd(), "src"))
  ? process.cwd()
  : path.resolve(process.cwd(), "apps/web");

const SUBJECT_ROOT = path.join(
  WEB_ROOT,
  "src/lib/subjects/linux-terminal-fundamentals",
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

describe("linux terminal fundamentals content", () => {
  it("uses terminalExpectations for output-only command practice", () => {
    const whereAmI = readJson(topicPath(1, "where-am-i"));
    const viewingFileContents = readJson(topicPath(2, "viewing-file-contents"));

    expect(whereAmI.serviceDefaults?.layoutMode).toBe("terminal_workspace");
    expect(whereAmI.serviceDefaults?.terminalSessionScope).toBe("topic");
    expect(viewingFileContents.serviceDefaults?.layoutMode).toBe("terminal_workspace");
    expect(viewingFileContents.serviceDefaults?.terminalSessionScope).toBe("topic");

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
});
