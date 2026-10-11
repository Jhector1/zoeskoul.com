import { describe, expect, it } from "vitest";

import { authoredManifestTopicAliasSuffixes } from "./authoredManifestTopicIdentity";

describe("authoredManifestTopicAliasSuffixes", () => {
    it("builds the module-scoped suffix for a canonical manifest topic id", () => {
        expect(
            authoredManifestTopicAliasSuffixes(["links-and-anchors"]),
        ).toEqual([".links-and-anchors"]);
    });

    it("deduplicates canonical and already-namespaced identities by leaf topic id", () => {
        expect(
            authoredManifestTopicAliasSuffixes([
                "html_module_2.links-and-anchors",
                "links-and-anchors",
            ]),
        ).toEqual([".links-and-anchors"]);
    });

    it("does not manufacture an alias for an empty identity", () => {
        expect(authoredManifestTopicAliasSuffixes(["", "   "])).toEqual([]);
    });
});
