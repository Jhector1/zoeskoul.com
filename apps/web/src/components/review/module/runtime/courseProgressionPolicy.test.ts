import { describe, expect, it } from "vitest";

import {
    getCourseModuleEntryPolicy,
    isModuleTopicUnlocked,
} from "./courseProgressionPolicy";

describe("course progression policy", () => {
    it("keeps every accessible module entry open regardless of course progress", () => {
        expect(
            getCourseModuleEntryPolicy({
                unlockAll: false,
                accessOk: true,
            }),
        ).toEqual({
            progressionOpen: true,
            accessOpen: true,
            accessLocked: false,
        });
    });

    it("keeps billing access separate from progression", () => {
        expect(
            getCourseModuleEntryPolicy({
                unlockAll: false,
                accessOk: false,
            }),
        ).toEqual({
            progressionOpen: true,
            accessOpen: false,
            accessLocked: true,
        });
    });

    it("always opens the first topic in a module", () => {
        expect(
            isModuleTopicUnlocked({
                topicIndex: 0,
                previousTopicComplete: false,
                unlockAll: false,
            }),
        ).toBe(true);
    });

    it("keeps later topics sequential", () => {
        expect(
            isModuleTopicUnlocked({
                topicIndex: 1,
                previousTopicComplete: false,
                unlockAll: false,
            }),
        ).toBe(false);

        expect(
            isModuleTopicUnlocked({
                topicIndex: 1,
                previousTopicComplete: true,
                unlockAll: false,
            }),
        ).toBe(true);
    });

    it("lets privileged learners bypass topic progression", () => {
        expect(
            isModuleTopicUnlocked({
                topicIndex: 5,
                previousTopicComplete: false,
                unlockAll: true,
            }),
        ).toBe(true);
    });
});
