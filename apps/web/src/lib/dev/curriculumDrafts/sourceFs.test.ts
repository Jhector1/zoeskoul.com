import { describe, expect, it } from "vitest";
import { listSourceDraftsWithDebug, loadSourceTopic } from "./sourceFs";

describe("canonical curriculum source filesystem", () => {
  it("enumerates .curriculum-drafts and compiles a topic in memory", async () => {
    const listed = await listSourceDraftsWithDebug("en");
    const api = listed.catalogs
      .find((catalog) => catalog.catalog === "web")
      ?.subjects.find((subject) => subject.subject === "api");
    expect(api?.modules[0]?.topics.length).toBeGreaterThan(0);
    expect(listed.debug.draftRoot).toMatch(/\.curriculum-drafts$/);

    const loaded = await loadSourceTopic({
      catalog: "web",
      subject: "api",
      module: "api-foundations-module-1-http-contracts",
      topic: "api-requests-responses-and-endpoints",
      locale: "en",
    });
    expect(loaded.relativeSourcePath).toBe(
      ".curriculum-drafts/web/subjects/api/courses/api-foundations/topics/api-foundations-module-1-http-contracts/api-requests-responses-and-endpoints.json",
    );
    expect(loaded.profileId).toBe("api");
    expect(loaded.bundleJson).toMatchObject({
      topicId: "api-requests-responses-and-endpoints",
      runtimeDefaults: { language: "javascript", supportsTerminal: true },
    });
    expect(loaded.sourceJson).toMatchObject({
      title: "API Requests, Responses, and Endpoints",
    });
  });
});
