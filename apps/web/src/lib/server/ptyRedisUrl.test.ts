import { describe, it, expect } from "vitest";
import { selectPtyRedisUrl } from "./ptyRedisUrl";

describe("PTY Redis canonical environment setting", () => {
  it("uses only PTY_REDIS_URL", () => {
    expect(selectPtyRedisUrl({ PTY_REDIS_URL: " redis://localhost:6379/2 " }))
      .toBe("redis://localhost:6379/2");
  });
  it("refuses an absent or blank setting", () => {
    expect(() => selectPtyRedisUrl({})).toThrow("PTY_REDIS_URL");
    expect(() => selectPtyRedisUrl({ PTY_REDIS_URL: "  " })).toThrow("PTY_REDIS_URL");
  });
  it("never consumes a generic or handoff Redis URL", () => {
    const unrelated = {
      // Explicitly absent canonical key: tests must not use generic or handoff Redis.
      PTY_REDIS_URL: undefined,
      REDIS_URL: "redis://wrong:secret@host/0",
      ZOESKOUL_BUILD_HANDOFF_REDIS_URL: "redis://wrong:secret@host/1",
    };
    expect(() => selectPtyRedisUrl(unrelated)).toThrow("PTY_REDIS_URL");
    try {
      selectPtyRedisUrl(unrelated);
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  });
});
