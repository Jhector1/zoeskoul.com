import { describe, expect, it } from "vitest";

import {
  readAiTutorUnlocked,
  rememberAiTutorUnlocked,
  resolveAiTutorSurface,
} from "./tutorAvailability";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("AI tutor durable exercise unlock", () => {
  it("remembers availability for the same exercise only", () => {
    const storage = memoryStorage();

    expect(readAiTutorUnlocked("exercise-a", storage)).toBe(false);
    rememberAiTutorUnlocked("exercise-a", storage);

    expect(readAiTutorUnlocked("exercise-a", storage)).toBe(true);
    expect(readAiTutorUnlocked("exercise-b", storage)).toBe(false);
  });

  it("keeps a collapsed tutor available as a launcher", () => {
    expect(
      resolveAiTutorSurface({
        available: true,
        open: false,
        offerDismissed: true,
      }),
    ).toBe("launcher");

    expect(
      resolveAiTutorSurface({
        available: true,
        open: true,
        offerDismissed: true,
      }),
    ).toBe("panel");
  });

  it("fails safely when browser storage is unavailable", () => {
    const storage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };

    expect(readAiTutorUnlocked("exercise-a", storage)).toBe(false);
    expect(() => rememberAiTutorUnlocked("exercise-a", storage)).not.toThrow();
  });
});
