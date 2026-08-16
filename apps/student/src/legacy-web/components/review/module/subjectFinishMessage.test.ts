import { describe, expect, it } from "vitest";

import {
    resolveSubjectFinishDisplayMessage,
    subjectFinishMessageKey,
} from "./subjectFinishMessage";

function translator(messages: Record<string, string>) {
    const t = ((key: string) => messages[key] ?? key) as {
        (key: string): string;
        has: (key: string) => boolean;
    };
    t.has = (key: string) => Object.prototype.hasOwnProperty.call(messages, key);
    return t;
}

describe("subject finish message resolution", () => {
    it("resolves a tagged subject-specific more-coming key", () => {
        const t = translator({
            "subjects.sql-v2.moreComingSoon":
                "More SQL lessons are coming soon.",
        });

        expect(
            resolveSubjectFinishDisplayMessage({
                serverMessage: "@:subjects.sql-v2.moreComingSoon",
                fallback: "More modules are coming soon.",
                t,
            }),
        ).toBe("More SQL lessons are coming soon.");
    });

    it("resolves an untagged canonical key defensively", () => {
        const t = translator({
            "subjects.sql-v2.moreComingSoon":
                "More SQL lessons are coming soon.",
        });

        expect(
            resolveSubjectFinishDisplayMessage({
                serverMessage: "subjects.sql-v2.moreComingSoon",
                fallback: "More modules are coming soon.",
                t,
            }),
        ).toBe("More SQL lessons are coming soon.");
    });

    it("never leaks a missing tagged key to the learner", () => {
        const t = translator({});

        expect(
            resolveSubjectFinishDisplayMessage({
                serverMessage: "@:subjects.sql-v2.moreComingSoon",
                fallback: "More modules are coming soon.",
                t,
            }),
        ).toBe("More modules are coming soon.");
    });

    it("preserves a real server-authored literal message", () => {
        const t = translator({});

        expect(
            resolveSubjectFinishDisplayMessage({
                serverMessage:
                    "You finished everything currently published.",
                fallback: "More modules are coming soon.",
                t,
            }),
        ).toBe("You finished everything currently published.");
    });

    it("recognizes only canonical key-shaped values", () => {
        expect(
            subjectFinishMessageKey("@:subjects.sql-v2.moreComingSoon"),
        ).toBe("subjects.sql-v2.moreComingSoon");
        expect(
            subjectFinishMessageKey("A real learner-facing sentence."),
        ).toBeNull();
    });
});
