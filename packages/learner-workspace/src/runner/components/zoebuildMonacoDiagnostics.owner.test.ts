import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const editor = readFileSync(
  fileURLToPath(new URL("./EditorPane.tsx", import.meta.url)),
  "utf8",
);

describe("ZoeBuild Monaco diagnostics policy", () => {
  it("enables React JSX parsing while preserving syntax diagnostics", () => {
    expect(editor).toContain("jsx: jsxEmit");
    expect(editor).toContain("allowNonTsExtensions: true");
    expect(editor).toContain("noSyntaxValidation: false");
  });

  it("suppresses browser-only semantic squiggles only for ZoeBuild", () => {
    expect(editor).toContain('appName === "zoebuild"');
    expect(editor).toContain('window.location.port === "3004"');
    expect(editor).toContain(
      'window.location.hostname.toLowerCase() === "build.zoeskoul.com"',
    );
    expect(editor).toContain("noSemanticValidation: true");
    expect(editor).toContain("noSuggestionDiagnostics: true");
  });

  it("does not disable Monaco validation decorations globally", () => {
    expect(editor).not.toContain('renderValidationDecorations: "off"');
    expect(editor).not.toContain("setModelMarkers(");
  });
  it("configures the Monaco instance owned by the mounted editor", () => {
    expect(editor).toContain("beforeMount={(monaco: any) => {");
    expect(editor).toContain("applyZoeBuildMonacoDiagnostics(monaco);");
    expect(editor).not.toContain('void import("monaco-editor")');
    expect(editor).not.toContain("useZoeBuildMonacoDiagnostics();");
  });

  it("resolves Monaco TypeScript defaults across current and legacy namespace layouts", () => {
    expect(editor).toContain("monaco?.typescript ??");
    expect(editor).toContain("monaco?.languages?.typescript");
    expect(editor).toContain("typescript.typescriptDefaults");
    expect(editor).toContain("typescript.javascriptDefaults");
    expect(editor).toContain("typescript.JsxEmit?.ReactJSX");
    expect(editor).toContain("typescript.JsxEmit?.React");
  });

});
