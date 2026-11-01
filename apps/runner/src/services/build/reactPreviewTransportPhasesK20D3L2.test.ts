import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PERSISTENT_PREVIEW_HTTP_WORKER } from "./reactPreviewPersistentHttp.js";

const source = readFileSync(resolve(process.cwd(), "src/services/build/reactPreviewPersistentHttp.ts"), "utf8");

describe("K20D3L2 safe persistent preview phase profiling", () => {
  it("keeps the exact transport trust boundaries and capacity controls", () => {
    expect(source).toContain("const MAX_IN_FLIGHT = 16;");
    expect(source).toContain("const MAX_DOCKER_FRAME = 9 * 1024 * 1024;");
    expect(source).toContain("LIMIT = 6 * 1024 * 1024");
    expect(source).toContain('if not newurl.startswith("http://127.0.0.1:5173/")');
    expect(source).toContain('const exec = await docker.getContainer(containerId).exec({');
    expect(source).toContain('Buffer.concat(this.textChunks, this.textBytes)');
  });
  it("keeps profiling metadata separate from the browser-facing response and never logs paths", () => {
    expect(source).toContain('"_transportTiming"');
    expect(source).toContain('this.reportSlowTransport(pending, reply)');
    expect(source).toContain('console.info("RUNNER preview transport phases", {');
    const logging = source.split('console.info("RUNNER preview transport phases", {')[1]?.split('});')[0] || "";
    expect(logging).not.toMatch(/\bpath\b|containerId|actorKey|header|bodyBase64/);
    expect(source).toContain('headers: reply.headers as Record<string, string>, bodyBase64: reply.bodyBase64 });');
  });
  it("embeds syntactically valid Python while measuring worker queue, fetch, encoding, and writer contention", () => {
    const parsed = spawnSync("python3", ["-c", "import ast,sys; ast.parse(sys.stdin.read())"], {
      input: PERSISTENT_PREVIEW_HTTP_WORKER, encoding: "utf8", timeout: 10_000,
    });
    expect(parsed.status).toBe(0);
    for (const phase of ["queueMs", "viteHeadersMs", "viteReadMs", "encodeMs", "writerWaitMs"]) {
      expect(PERSISTENT_PREVIEW_HTTP_WORKER).toContain(phase);
    }
  });
});
