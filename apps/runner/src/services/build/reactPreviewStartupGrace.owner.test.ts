import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const runtime = readFileSync(
  resolve(
    process.cwd(),
    "src/services/build/reactPreviewRuntime.ts",
  ),
  "utf8",
);

describe("React preview startup grace ownership", () => {
  it("preserves the normal 20 second startup deadline", () => {
    expect(runtime).toContain(
      "const PREVIEW_START_TIMEOUT_MS =\n  20_000;",
    );
  });

  it("adds bounded grace only for transient connection refusal", () => {
    expect(runtime).toContain(
      "const PREVIEW_START_CONNECTION_GRACE_MS =\n  40_000;",
    );
    expect(runtime).toContain(
      "function isTransientPreviewStartupError(",
    );
    expect(runtime).toContain("/ECONNREFUSED/i");
    expect(runtime).toContain("/Connection refused/i");
    expect(runtime).toContain(
      "now < connectionGraceDeadline &&",
    );
  });

  it("still fails immediately when the child container exits", () => {
    expect(runtime).toContain(
      "!state.State.Running",
    );
    expect(runtime).toContain(
      '"Trusted React preview server exited before becoming ready."',
    );
  });

  it("never exposes the raw bridge traceback in the timeout error", () => {
    expect(runtime).toContain(
      '"Trusted React preview server did not become ready."',
    );
    expect(runtime).not.toContain(
      "? `: ${lastError.message}`",
    );
    expect(runtime).toContain(
      '"RUNNER React preview readiness deadline exceeded"',
    );
    expect(runtime).toContain(
      '"connection-refused"',
    );
  });
});
