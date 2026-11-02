import { describe, expect, it } from "vitest";
import { assertTanstackStartCutoverReady, TANSTACK_START_CUTOVER_GATES } from "./tanstackStartRuntime";

describe("TanStack Start cutover gates", () => {
  it("blocks a partial or unverified full-stack deployment", () => {
    const gates = Object.fromEntries(TANSTACK_START_CUTOVER_GATES.map(key => [key, false]));
    expect(() => assertTanstackStartCutoverReady(gates as never)).toThrow("cutover blocked");
  });
  it("allows activation only when every server and tenant boundary is verified", () => {
    const gates = Object.fromEntries(TANSTACK_START_CUTOVER_GATES.map(key => [key, true]));
    expect(() => assertTanstackStartCutoverReady(gates as never)).not.toThrow();
  });
});
