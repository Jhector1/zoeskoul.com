import { describe, expect, it } from "vitest";
import { validateGitProjectJourneyDraft } from "./validateGitProjectJourneyDraft.js";

const seed = {
    topicId: "edit-page",
    projectJourney: {
        journeyId: "guided-community-site",
        entryMilestone: "first-snapshot",
        exitMilestone: "edited-page",
    },
    projectJourneys: [
        {
            id: "guided-community-site",
            role: "guided",
            title: "Community Site",
            repositoryPath: "community-site",
            continuity: "course",
            supportLevel: "guided",
            exactEditInstructionsRequired: true,
            milestoneOrder: ["first-snapshot", "edited-page"],
        },
    ],
} as any;

function draft(prompt: string, path = "community-site/index.html") {
    return {
        title: "Edit Page",
        summary: "Edit one supplied line.",
        minutes: 10,
        sketchBlocks: [],
        quizDraft: [
            {
                id: "edit-index",
                kind: "code_input",
                title: "Edit Index",
                prompt,
                hint: "Use the supplied text.",
                help: { concept: "Git", hint_1: "One", hint_2: "Two" },
                starterCode: "",
                entryFilePath: "main.sh",
                starterFiles: [
                    { path, content: "" },
                    { path: ".zoeskoul/setup.sh", content: "#!/bin/sh\n" },
                ],
                solutionCode: "git diff -- index.html",
                gitExpectations: { repositoryPath: "community-site" },
            },
        ],
    } as any;
}

describe("validateGitProjectJourneyDraft", () => {
    it("accepts exact file-edit guidance inside the authored repository", () => {
        const issues = validateGitProjectJourneyDraft({
            seed,
            draft: draft(
                "Open `community-site/index.html`. Find `<h1>Old</h1>` and replace it with `<h1>New</h1>`. Save the file.",
            ),
        });

        expect(issues).toEqual([]);
    });

    it("rejects cross-project paths and vague web-development edits", () => {
        const issues = validateGitProjectJourneyDraft({
            seed,
            draft: draft("Open index.html and improve the page.", "other-site/index.html"),
        });

        expect(issues.map((issue) => issue.code)).toEqual([
            "GIT_PROJECT_JOURNEY_PATH_MISMATCH",
            "GIT_FILE_EDIT_PATH_NOT_EXPLICIT",
            "GIT_FILE_EDIT_NOT_EXACT",
        ]);
    });

    it("rejects a grading repository that points at a different project journey", () => {
        const value = draft(
            "Open `community-site/index.html`. Find `<h1>Old</h1>` and replace it with `<h1>New</h1>`. Save the file.",
        );
        value.quizDraft[0].gitExpectations.repositoryPath = "volunteer-hub";

        const issues = validateGitProjectJourneyDraft({ seed, draft: value });

        expect(issues.map((issue) => issue.code)).toEqual([
            "GIT_PROJECT_JOURNEY_REPOSITORY_MISMATCH",
        ]);
    });

    it("requires an exact edit payload and insertion or replacement location", () => {
        const issues = validateGitProjectJourneyDraft({
            seed,
            draft: draft(
                "Open `community-site/index.html` and add exactly some welcoming text. Save the file.",
            ),
        });

        expect(issues.map((issue) => issue.code)).toEqual([
            "GIT_FILE_EDIT_NOT_EXACT",
        ]);
    });

    it("accepts exact multi-line content anchored to a line number", () => {
        const issues = validateGitProjectJourneyDraft({
            seed,
            draft: draft(
                "In the Explorer, create `community-site/index.html`. Starting on line 1, enter exactly these three lines: `<!doctype html>` `<title>Community</title>` `<h1>Welcome</h1>`.",
            ),
        });

        expect(issues).toEqual([]);
    });

    it("does not mistake a supplied previous edit for a new file-edit instruction", () => {
        const issues = validateGitProjectJourneyDraft({
            seed,
            draft: draft(
                "The previous step left the exact `<h1>Temporary</h1>` edit unstaged in `community-site/index.html`. Type `git restore index.html` and press Enter.",
            ),
        });

        expect(issues).toEqual([]);
    });

});
