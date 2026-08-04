import { describe, expect, it } from "vitest";

import {
    isPtyRunnerLanguage,
    unsupportedPtyRunnerLanguageMessage,
} from "./language";

describe("PTY runner language routing", () => {
    it("accepts R as an interactive PTY language", () => {
        expect(isPtyRunnerLanguage("r")).toBe(true);
    });

    it("keeps SQL on the dedicated SQL runner", () => {
        expect(isPtyRunnerLanguage("sql")).toBe(false);
        expect(unsupportedPtyRunnerLanguageMessage("sql")).toBe(
            "PTY runner does not support SQL. Use the SQL runner instead.\r\n",
        );
    });
});
