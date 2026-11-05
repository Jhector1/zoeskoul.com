import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const remote = readFileSync(fileURLToPath(new URL(
  "../../../../../packages/learner-workspace/src/runner/components/RemoteWebPreview.tsx",
  import.meta.url,
)), "utf8");

describe("K20D2E2 preview document readiness", () => {
  it("does not report an unrendered React page before the exact iframe finishes loading", () => {
    expect(remote).toContain('setLoadedDocumentSrc(src);');
    expect(remote).toContain('loadedDocumentSrc !== iframeSrc');
    expect(remote).toContain('PREVIEW_RENDER_CONFIRMATION_MS = 60_000');
    expect(remote).not.toContain('}, 15_000);');
    expect(remote).toContain('document loaded but did not confirm');
  });

  it("reports slow documents as progress, not a failed React render", () => {
    expect(remote).toContain('PREVIEW_DOCUMENT_SLOW_NOTICE_MS = 20_000');
    expect(remote).toContain('Still loading preview…');
    expect(remote).toContain('documentIsSlow');
    expect(remote).toContain('Retry document');
  });

  it("accepts only revision-matching React render attestations and retains sandbox isolation", () => {
    expect(remote).toContain('value.revision !== expectedRevision');
    expect(remote).toContain('if (!value.rendered) return;');
    expect(remote).toContain('setRenderProblem(null);');
    expect(remote).toContain('sandbox="allow-scripts allow-forms allow-modals"');
    expect(remote).not.toContain('allow-same-origin');
  });

  it("shows genuine runner or authentication errors ahead of local loading notices", () => {
    expect(remote).toContain('preview.state === "error" ? "Preview unavailable"');
    expect(remote).toContain('preview.message ?? renderProblem');
    expect(remote).toContain('preview.state === "error" ? "Retry preview" : "Retry document"');
  });
});
