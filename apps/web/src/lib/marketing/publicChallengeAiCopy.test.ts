import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./publicChallengeCopyContext", () => ({ resolvePublicChallengeCopyContext: mocks.context }));

let resolveAutomatedPublicChallengeCopy: typeof import("./publicChallengeAiCopy").resolveAutomatedPublicChallengeCopy;

const option = {
  id: "generic", catalogSlug: "catalog", catalogTitle: "Catalog", subjectSlug: "subject", subjectTitle: "Subject",
  moduleSlug: "module", moduleTitle: "Module", sectionSlug: "section", sectionTitle: "Section", sectionRole: "lesson",
  topicSlug: "topic", topicTitle: "Topic", exerciseKey: "target-five", exerciseTitle: "practice target five",
  exercisePrompt: "Change target_resource `id = 5` to `active` and verify `status`.", exerciseKind: "code_input",
  exercisePurpose: "practice", isMultiFile: false, requiresTerminal: false, isStandaloneTryIt: false, releaseStatus: "active",
} as const;

const context = {
  locale: "en", language: "example", runtimeKind: "example",
  coursePath: { catalog: "Catalog", subject: "Subject", module: "Module", section: "Section", topic: "Topic" },
  exercise: { key: "target-five", kind: "code_input", purpose: "practice", originalTitle: "Practice: Change and Verify", originalPrompt: "Change target_resource id 5 to active and verify status." },
  starterCode: null, privateSolutionContext: "PRIVATE COMPLETE SOLUTION", validation: null, semanticChecks: null, tests: null,
  manifestContext: { runtime: null, workspace: null, recipe: null }, environment: {}, resources: [],
  requiredFacts: ["target_resource", "5", "active", "status"], technicalFallbackLead: "In target_resource",
  storyFrame: { id: "release-check", guidance: "Use a release scenario.", fallbackLead: "A product team is preparing a release, and you need to finish one small but important task." },
};

beforeAll(async () => ({ resolveAutomatedPublicChallengeCopy } = await import("./publicChallengeAiCopy")));
beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.ZOESKOUL_PUBLIC_CHALLENGE_AI_COPY_ENABLED = "true";
  mocks.context.mockResolvedValue(context);
});
afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ZOESKOUL_PUBLIC_CHALLENGE_AI_COPY_ENABLED;
  vi.unstubAllGlobals();
});

describe("course-agnostic story-based challenge copy", () => {
  it("sends story guidance and preserves technical facts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ title: "Change and Verify a Target", prompt: "Your product team is preparing a release. Update target_resource id 5 to active, then verify status before sign-off." }) }] }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolveAutomatedPublicChallengeCopy({ locale: "en", option });
    expect(result.source).toBe("ai");
    expect(result.prompt).toContain("target_resource");
    expect(result.prompt).toContain("id 5");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.input).toContain('"storyFrame"');
    expect(body.instructions).toContain("Do NOT repeatedly start with 'Imagine you are'");
  });

  it("uses story fallback when AI fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await resolveAutomatedPublicChallengeCopy({ locale: "en", option });
    expect(result.source).toBe("fallback");
    expect(result.prompt).toContain("A product team is preparing a release");
    expect(result.prompt).toContain("target_resource");
    expect(result.prompt.length).toBeLessThanOrEqual(320);
  });

  it("rejects a story that loses required technical facts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ title: "Help the Release Team", prompt: "A release is approaching and your team needs one quick fix before sign-off." }) }] }] }) }));
    const result = await resolveAutomatedPublicChallengeCopy({ locale: "en", option });
    expect(result.source).toBe("fallback");
    expect(result.prompt).toContain("target_resource");
  });
});
