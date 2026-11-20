import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("AI4B2 R2 server secret boundary",()=>{
  it("does not expose cloud credentials to the public runtime",()=>{
    const source = readFileSync(join(import.meta.dirname, "cloudflareR2MediaServer.ts"), "utf8");
    expect(source).not.toContain("NEXT_PUBLIC_");
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("process.env.ZOEBUILD_MEDIA_R2_SECRET_ACCESS_KEY");
    expect(source).toContain("constants.O_NOFOLLOW");
    expect(source).toContain("stat.mode & 0o777");
  });
});
