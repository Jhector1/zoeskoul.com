import { describe, expect, it } from "vitest";
import { BuildExecutorContractError, parseTrustedBuildJobRequest } from "./index";

function request() {
  return {
    protocolVersion: 1,
    operation: "dependency-lock-bootstrap",
    buildProjectId: "build_1",
    sourceVersion: 2,
    stackId: "react-vite-v1",
    templateId: "react-vite-v1",
    files: [
      { path: "package.json", content: '{"name":"example"}' },
      { path: "src/App.tsx", content: "export default function App() { return null; }" },
    ],
  };
}

describe("trusted Build executor contract", () => {
  it("accepts the narrow lock-bootstrap request shape", () => {
    expect(parseTrustedBuildJobRequest(request())).toMatchObject({
      protocolVersion: 1,
      operation: "dependency-lock-bootstrap",
      buildProjectId: "build_1",
      sourceVersion: 2,
      stackId: "react-vite-v1",
      templateId: "react-vite-v1",
    });
  });

  it("rejects command, shell, cwd, env, network, image, and argv fields", () => {
    for (const key of ["command", "argv", "shell", "cwd", "env", "network", "image"]) {
      expect(() => parseTrustedBuildJobRequest({ ...request(), [key]: "not-allowed" }))
        .toThrow(BuildExecutorContractError);
    }
  });

  it("rejects traversal, duplicate paths, and preexisting lockfiles", () => {
    expect(() => parseTrustedBuildJobRequest({
      ...request(),
      files: [...request().files, { path: "../escape.txt", content: "x" }],
    })).toThrow(/unsafe executor file path/i);

    expect(() => parseTrustedBuildJobRequest({
      ...request(),
      files: [
        { path: "package.json", content: "{}" },
        { path: "PACKAGE.JSON", content: "{}" },
      ],
    })).toThrow(/duplicate executor file path/i);

    expect(() => parseTrustedBuildJobRequest({
      ...request(),
      files: [...request().files, { path: "pnpm-lock.yaml", content: "lockfileVersion: '9.0'" }],
    })).toThrow(/requires pnpm-lock.yaml to be absent/i);
  });
});
