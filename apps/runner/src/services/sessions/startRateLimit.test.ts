import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { env } from "../../lib/env.js";
import { consumeStartToken } from "./startRateLimit.js";

describe("session start rate limiting", () => {
  it("keeps code-run and shell-terminal budgets independent", () => {
    const actorKey = `separate-budgets-${randomUUID()}`;

    for (let index = 0; index < env.codeStartsPerMinutePerActor; index += 1) {
      consumeStartToken(actorKey, "code");
    }

    expect(() => consumeStartToken(actorKey, "code")).toThrow(
      `Too many code runs. Limit is ${env.codeStartsPerMinutePerActor} per minute.`,
    );
    expect(() => consumeStartToken(actorKey, "shell")).not.toThrow();
  });

  it("retains a stricter terminal-start safeguard", () => {
    const actorKey = `terminal-budget-${randomUUID()}`;

    for (let index = 0; index < env.shellStartsPerMinutePerActor; index += 1) {
      consumeStartToken(actorKey, "shell");
    }

    expect(() => consumeStartToken(actorKey, "shell")).toThrow(
      `Too many terminal starts. Limit is ${env.shellStartsPerMinutePerActor} per minute.`,
    );
  });
});
