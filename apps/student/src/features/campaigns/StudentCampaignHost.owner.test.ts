import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(rel: string) {
  return fs.readFileSync(
    path.join(root, rel),
    "utf8",
  );
}

describe("global student campaign host", () => {
  it("mounts only for authenticated Student app sessions", () => {
    const app = source("src/App.tsx");
    expect(app).toContain(
      "StudentCampaignHost",
    );
    expect(app).toContain(
      "session.authenticated",
    );
  });

  it("uses server tracking instead of browser persistence", () => {
    const host = source(
      "src/features/campaigns/StudentCampaignHost.tsx",
    );
    const client = source(
      "src/features/campaigns/studentCampaignClient.ts",
    );

    expect(host).toContain(
      'event.key === "Escape"',
    );
    expect(host).toContain(
      "createPortal",
    );
    expect(host).toContain(
      "zoeskoul:vite-navigation",
    );
    expect(client).toContain(
      "/api/student-campaigns/active",
    );
    expect(client).toContain(
      "/events",
    );
    expect(host).toContain(
      "dont_show_again",
    );
    expect(host).toContain(
      "formatCampaignRemaining",
    );
    expect(host).toContain(
      "Don&apos;t show this campaign again",
    );
    expect(host + client).not.toContain(
      "localStorage",
    );
  });
});
