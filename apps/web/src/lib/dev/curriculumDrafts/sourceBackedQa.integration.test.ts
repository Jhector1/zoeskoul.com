import { describe, expect, it } from "vitest";
import { loadSourceTopic } from "./sourceFs";
import { buildDraftPreviewReviewModule } from "./preview";
import { toolsPolicyForSubject } from "@zoeskoul/learner-ui/lib/tools/policy";

const ref = {
  catalog: "web",
  subject: "api",
  module: "api-foundations-module-1-http-contracts",
  topic: "api-requests-responses-and-endpoints",
  locale: "en",
};

describe("source-backed Draft QA", () => {
  it("uses the saved-source runtime for the learner preview", async () => {
    const sourceTopic = await loadSourceTopic(ref);
    const bundle = sourceTopic.bundleJson as {
      topicId: string;
      exercises: Array<{ id: string }>;
    };
    expect(bundle.exercises[0]?.id).toBeTruthy();

    const module = await buildDraftPreviewReviewModule(ref);
    expect(module.profileId).toBe("api");
    expect(module.runtimeDefaults).toMatchObject({
      language: "javascript",
      supportsTerminal: true,
    });
    expect(
      toolsPolicyForSubject(ref.subject, undefined, module.profileId),
    ).toEqual({ codeEnabled: true });
    expect(module.topics.some((topic) => topic.id.includes(ref.topic))).toBe(true);
  });
});
