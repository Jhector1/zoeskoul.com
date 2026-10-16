import { describe, expect, it } from "vitest";

import {
  BUILD_STACKS_V1,
  COMMERCE_STACK_IDS_V1,
  isCommerceStackId,
} from "./index";

describe("commerce runtime stacks", () => {
  it("registers static and React/Vite commerce stacks", () => {
    expect(COMMERCE_STACK_IDS_V1).toEqual([
      "commerce-static-v1",
      "commerce-react-vite-v1",
    ]);

    const staticStack = BUILD_STACKS_V1.find((stack) => stack.id === "commerce-static-v1");
    const reactStack = BUILD_STACKS_V1.find((stack) => stack.id === "commerce-react-vite-v1");

    expect(staticStack).toMatchObject({
      runtimeProfileId: "build-static-v1",
      templateId: "commerce-static-v1",
      commerceRuntime: "static",
      preview: { type: "static" },
    });

    expect(reactStack).toMatchObject({
      runtimeProfileId: "build-node-v1",
      templateId: "commerce-react-vite-v1",
      commerceRuntime: "react-vite",
      preview: { type: "server", port: 5173 },
    });

    expect(isCommerceStackId("commerce-static-v1")).toBe(true);
    expect(isCommerceStackId("commerce-react-vite-v1")).toBe(true);
    expect(isCommerceStackId("react-vite-v1")).toBe(false);
  });
});
