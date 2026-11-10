import { describe, expect, it } from "vitest";
import { DISCOVERY_HIDDEN_META_KEY as KEY, isDiscoveryHidden, seedMetaPreservingDiscoveryFlag } from "./discoveryVisibilityMeta";

describe("discovery flag on existing catalog and course meta", () => {
    it("reads only explicit true from object meta", () => {
        expect(isDiscoveryHidden({ [KEY]: true })).toBe(true);
        for (const meta of [null, {}, { [KEY]: false }, { [KEY]: "true" }, [], 0]) {
            expect(isDiscoveryHidden(meta)).toBe(false);
        }
    });
    it("does not permit manifest metadata to overwrite admin hidden preference", () => {
        expect(seedMetaPreservingDiscoveryFlag({ level: "new", [KEY]: false }, { level: "old", [KEY]: true }))
            .toEqual({ level: "new", [KEY]: true });
        expect(seedMetaPreservingDiscoveryFlag({ level: "new" }, { [KEY]: false }))
            .toEqual({ level: "new", [KEY]: false });
    });
    it("does not modify seed metadata when no administrator preference exists", () => {
        const seed = { lessonVersion: 2 };
        expect(seedMetaPreservingDiscoveryFlag(seed, {})).toBe(seed);
        expect(seedMetaPreservingDiscoveryFlag(null, null)).toBeNull();
        expect(seedMetaPreservingDiscoveryFlag({ [KEY]: true, title: "test" }, null))
            .toEqual({ title: "test" });
    });
    it("retains hidden flag even when manifest metadata is null", () => {
        expect(seedMetaPreservingDiscoveryFlag(null, { [KEY]: true }))
            .toEqual({ [KEY]: true });
    });
});
