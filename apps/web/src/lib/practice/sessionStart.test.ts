import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { startOrResumePracticeSession } from "./sessionStart";

describe("startOrResumePracticeSession", () => {
  it("recovers the winning session after a concurrent unique-key create", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "winner" });
    const update = vi.fn().mockResolvedValue({ id: "winner" });
    const create = vi.fn().mockRejectedValue({ code: "P2002" });

    const result = await startOrResumePracticeSession({
      prisma: {
        practiceSession: { findFirst, create, update },
      } as any,
      actor: { userId: "user-1", guestId: null },
      findWhere: { experienceKey: "module-assignment:user-1:module-1" },
      createData: {
        experienceKey: "module-assignment:user-1:module-1",
        mode: "standard",
        sectionId: "section-1",
        difficulty: "hard",
        targetCount: 15,
      } as any,
      resumeData: { returnUrl: "/en/review" },
      select: { id: true },
    });

    expect(result).toEqual({ session: { id: "winner" }, resumed: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: "winner" },
      data: { returnUrl: "/en/review" },
    });
  });

  it("rethrows unrelated unique errors when no matching winner exists", async () => {
    const original = { code: "P2002", meta: { target: ["otherField"] } };
    const findFirst = vi.fn().mockResolvedValue(null);

    await expect(
      startOrResumePracticeSession({
        prisma: {
          practiceSession: {
            findFirst,
            create: vi.fn().mockRejectedValue(original),
            update: vi.fn(),
          },
        } as any,
        actor: { userId: "user-1", guestId: null },
        findWhere: { experienceKey: "expected" },
        createData: {
          mode: "standard",
          sectionId: "section-1",
          difficulty: "hard",
          targetCount: 1,
        } as any,
      }),
    ).rejects.toBe(original);
  });
});
