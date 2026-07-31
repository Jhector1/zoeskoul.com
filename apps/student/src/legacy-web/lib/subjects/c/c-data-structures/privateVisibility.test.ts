import { describe, expect, it } from "vitest";

import manifest from "./subject.manifest.json";

describe("C data structures publication visibility", () => {
    it("stays private in the generated live manifest", () => {
        expect(manifest.subject.visibility).toBe("private");
    });
});
