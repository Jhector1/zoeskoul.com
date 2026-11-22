import {defineConfig} from "vitest/config";

export default defineConfig({
  root: process.cwd(),
  test: {
    environment: "node",
    include: [
      "src/services/execution/adminCapstoneWorkspaceSeed.test.ts"
    ],
    exclude: ["**/node_modules/**"],
  },
});
