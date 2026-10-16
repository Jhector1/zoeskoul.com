import { describe, expect, it } from "vitest";

import {
  REACT_VITE_STACK_V1,
  STATIC_HTML_STACK_V1,
} from "./index";

describe("ZoeBuild stack artifact contracts", () => {
  it("publishes static HTML directly from source", () => {
    expect(STATIC_HTML_STACK_V1.artifact).toEqual({
      type: "static-directory",
      outputPath: ".",
    });
  });

  it("declares Vite dist as the React production artifact", () => {
    expect(REACT_VITE_STACK_V1.artifact).toEqual({
      type: "static-directory",
      outputPath: "dist",
    });
    expect(REACT_VITE_STACK_V1.commands.install).toEqual([
      "pnpm",
      "install",
      "--frozen-lockfile",
    ]);
  });
});
