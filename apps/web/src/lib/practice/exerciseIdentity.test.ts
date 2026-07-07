import { describe, expect, it } from "vitest";
import { resolveStablePracticeExerciseId } from "./exerciseIdentity";

describe("resolveStablePracticeExerciseId", () => {
  it("prefers authored exerciseKey over the expiring practice token", () => {
    const first = resolveStablePracticeExerciseId({
      item: { key: "old.body.signature" } as any,
      exercise: { exerciseKey: "sql-select-products", kind: "code_input" } as any,
    });
    const refreshed = resolveStablePracticeExerciseId({
      item: { key: "new.body.signature" } as any,
      exercise: { exerciseKey: "sql-select-products", kind: "code_input" } as any,
    });

    expect(first).toBe("sql-select-products");
    expect(refreshed).toBe(first);
  });

  it("uses semantic authored fields before an index fallback", () => {
    expect(
      resolveStablePracticeExerciseId({
        exercise: {
          topic: "joins",
          kind: "code_input",
          title: "Join customers and orders",
        } as any,
        fallbackIndex: 4,
      }),
    ).toBe("joins:code_input:join-customers-and-orders");
  });
  it("keeps the same tool scope when only token expiry and signature change", () => {
    const token = (exp: number, signature: string) => {
      const body = Buffer.from(
        JSON.stringify({ instanceId: "instance-42", exp }),
      ).toString("base64url");
      return `${body}.${signature}`;
    };

    const first = resolveStablePracticeExerciseId({
      item: { key: token(100, "old-signature") } as any,
    });
    const refreshed = resolveStablePracticeExerciseId({
      item: { key: token(200, "new-signature") } as any,
    });

    expect(first).toBe("instance:instance-42");
    expect(refreshed).toBe(first);
  });

});
