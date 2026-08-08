import { describe, expect, it, vi } from "vitest";

import {
  getAiTutorRuntimeStatus,
  isAiTutorFallbackRequired,
  markAiTutorAvailable,
  readAiTutorUnlocked,
  rememberAiTutorUnlocked,
  resolveAiTutorSurface,
  setAiTutorRuntimeStatus,
  subscribeAiTutorRuntimeStatus,
} from "@zoeskoul/learner-ui/ai-tutor/tutorAvailability";

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


describe("AI tutor runtime availability", () => {
  it("notifies help surfaces when the tutor API becomes unavailable", () => {
    const key = "runtime-unavailable-exercise";
    const listener = vi.fn();
    const unsubscribe = subscribeAiTutorRuntimeStatus(key, listener);

    markAiTutorAvailable(key);
    expect(getAiTutorRuntimeStatus(key)).toBe("available");
    expect(isAiTutorFallbackRequired(getAiTutorRuntimeStatus(key))).toBe(false);

    setAiTutorRuntimeStatus(key, "unavailable");
    expect(getAiTutorRuntimeStatus(key)).toBe("unavailable");
    expect(isAiTutorFallbackRequired(getAiTutorRuntimeStatus(key))).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("hides the fallback again after a later tutor response succeeds", () => {
    const key = "runtime-recovered-exercise";
    setAiTutorRuntimeStatus(key, "failed");
    expect(isAiTutorFallbackRequired(getAiTutorRuntimeStatus(key))).toBe(true);

    markAiTutorAvailable(key);

    expect(getAiTutorRuntimeStatus(key)).toBe("available");
    expect(isAiTutorFallbackRequired(getAiTutorRuntimeStatus(key))).toBe(false);
  });
});
