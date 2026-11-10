import { describe, expect, it } from "vitest";
import { getRunnerWsBase } from "./runnerWsBase";

describe("canonical Runner WebSocket endpoints", () => {
  it("uses the separately configured private WebSocket origin", () => {
    expect(getRunnerWsBase({
      RUNNER_BASE_URL: "https://runner.example",
      RUNNER_WS_BASE_URL: "wss://terminal.example/",
    })).toBe("wss://terminal.example");
  });

  it("derives ws/wss from the canonical HTTP origin", () => {
    expect(getRunnerWsBase({ RUNNER_BASE_URL: "https://runner.example/" }))
      .toBe("wss://runner.example");
    expect(getRunnerWsBase({ RUNNER_BASE_URL: "http://127.0.0.1:4000" }))
      .toBe("ws://127.0.0.1:4000");
  });

  it("fails closed rather than consulting obsolete environment aliases", () => {
    const legacy = { RUNNER_BASE_URL: undefined, RUNNER_WS_BASE_URL: undefined, RUNNER_URL: "http://legacy.invalid", NEXT_PUBLIC_RUNNER_WS_BASE_URL: "ws://legacy.invalid" };
    expect(() => getRunnerWsBase(legacy)).toThrow(/Missing RUNNER/);
  });

  it("rejects invalid schemes without leaking environment values", () => {
    const secret = "privatepassword";
    expect(() => getRunnerWsBase({ RUNNER_WS_BASE_URL: `https://${secret}.invalid` }))
      .toThrow("RUNNER_WS_BASE_URL must begin with ws:// or wss://");
    try {
      getRunnerWsBase({ RUNNER_BASE_URL: `ftp://${secret}.invalid` });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
