import { describe, expect, it } from "vitest";

import { shouldAcceptMountedEditorChange } from "./EditorPane";

describe("EditorPane mounted model change ownership", () => {
    const indexPath =
        "inmemory://zoeskoul-runner/exercise/index.html";
    const profilePath =
        "inmemory://zoeskoul-runner/exercise/profile.png";

    it("accepts a change that belongs to the mounted model", () => {
        expect(
            shouldAcceptMountedEditorChange({
                expectedPath: indexPath,
                modelUri: indexPath,
                eventValue: "<h1>Edited</h1>",
                liveModelValue: "<h1>Edited</h1>",
            }),
        ).toBe(true);
    });

    it("rejects a previous-model URI", () => {
        expect(
            shouldAcceptMountedEditorChange({
                expectedPath: profilePath,
                modelUri: indexPath,
                eventValue: "<h1>Old index</h1>",
                liveModelValue: "",
            }),
        ).toBe(false);
    });

    it("rejects an old file payload after the new URI has mounted", () => {
        expect(
            shouldAcceptMountedEditorChange({
                expectedPath: profilePath,
                modelUri: profilePath,
                eventValue: "<!doctype html><h1>Student Profile</h1>",
                liveModelValue: "",
            }),
        ).toBe(false);
    });
});
