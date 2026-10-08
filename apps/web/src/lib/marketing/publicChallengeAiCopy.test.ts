import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  resolveExercise: vi.fn(),
  resolveBundle: vi.fn(),
  getSqlDataset: vi.fn(),
  getTranslations: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock(
  "@zoeskoul/curriculum-runtime/curriculum/resolveManifestExercise",
  () => ({
    resolveManifestExercise: mocks.resolveExercise,
  }),
);

vi.mock(
  "@zoeskoul/curriculum-runtime/subjects/sql/sql/datasets",
  () => ({
    getSqlDataset: mocks.getSqlDataset,
  }),
);

vi.mock("@/lib/curriculum/resolveTopicBundleManifest", () => ({
  resolveTopicBundleManifest: mocks.resolveBundle,
}));

vi.mock("next-intl/server", () => ({
  getTranslations: mocks.getTranslations,
}));

let resolveAutomatedPublicChallengeCopy:
  typeof import("./publicChallengeAiCopy").resolveAutomatedPublicChallengeCopy;

const option = {
  id: "sql-data-management::m0::s0::topic::practice-preview-update-verify-id-five",
  catalogSlug: "sql",
  catalogTitle: "SQL",
  subjectSlug: "sql-data-management",
  subjectTitle: "SQL Data Management",
  moduleSlug: "sql-data-management-module-0-safe-inserts",
  moduleTitle: "Safe Inserts",
  sectionSlug: "sql-data-management-sql-data-management-section-0-mutation-workflow",
  sectionTitle: "Mutation Workflow",
  sectionRole: "lesson",
  topicSlug:
    "sql_data_management_module_0.mutation-workflow-preview-change-verify",
  topicTitle: "Preview, Change, Verify",
  exerciseKey: "practice-preview-update-verify-id-five",
  exerciseTitle: "practice preview update verify id five",
  exercisePrompt:
    "@:topics.sql-data-management.mutation.practice-preview-update-verify-id-five.prompt",
  exerciseKind: "code_input",
  exercisePurpose: "practice",
  isMultiFile: true,
  requiresTerminal: false,
  isStandaloneTryIt: false,
  releaseStatus: "active",
} as const;

const authoredPrompt =
  "Use a preview SELECT before changing row `id = 5`, then set its status to `active`. Finish with a verification query that returns id, name, and status for row 5.";

beforeAll(async () => {
  ({
    resolveAutomatedPublicChallengeCopy,
  } = await import("./publicChallengeAiCopy"));
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-test";
  process.env.ZOESKOUL_PUBLIC_CHALLENGE_AI_COPY_ENABLED = "true";

  mocks.resolveBundle.mockReturnValue({
    topicId: "mutation-workflow-preview-change-verify",
    runtimeDefaults: {
      kind: "sql",
      datasetId: "inventory_ops",
      fixedSqlDialect: "sqlite",
    },
  });

  mocks.resolveExercise.mockReturnValue({
    id: option.exerciseKey,
    kind: "code_input",
    purpose: "practice",
    language: "sql",
    messageBase:
      "topics.sql-data-management.mutation.practice-preview-update-verify-id-five",
    runtime: {
      kind: "sql",
      datasetId: "inventory_ops",
      fixedSqlDialect: "sqlite",
    },
    workspace: {
      language: "sql",
      starterCode: "-- Apply the approved data change below.",
    },
    recipe: {
      datasetId: "inventory_ops",
      checkSql:
        "SELECT id, name, status FROM inventory_items WHERE id = 5;",
      solutionCode:
        "SELECT id, name, status FROM inventory_items WHERE id = 5; UPDATE inventory_items SET status = 'active' WHERE id = 5;",
    },
  });

  mocks.getSqlDataset.mockReturnValue({
    id: "inventory_ops",
    dialect: "sqlite",
    titleKey: "datasets.inventory_ops.title",
    descriptionKey: "datasets.inventory_ops.description",
    schemaSql:
      "CREATE TABLE inventory_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL);",
    seedSql:
      "INSERT INTO inventory_items (id, name, status) VALUES (5, 'Water Bottle', 'active');",
    tableSnapshots: {
      inventory_items: {
        name: "inventory_items",
        columns: [
          { name: "id", type: "INTEGER" },
          { name: "name", type: "TEXT" },
          { name: "status", type: "TEXT" },
        ],
        rows: [[5, "Water Bottle", "active"]],
        rowCount: 1,
      },
    },
  });

  mocks.getTranslations.mockResolvedValue(
    ((key: string) => {
      if (key.endsWith(".title")) {
        return "Practice: Preview, Update, Verify One Row";
      }
      if (key.endsWith(".prompt")) {
        return authoredPrompt;
      }
      return key;
    }) as any,
  );
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.ZOESKOUL_PUBLIC_CHALLENGE_AI_COPY_ENABLED;
  vi.unstubAllGlobals();
});

describe("automatic public challenge AI copy", () => {
  it("gives AI the full exercise and SQL dataset context but returns concise public copy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  title: "Preview, Update, and Verify a Row",
                  prompt:
                    "In the inventory_items table, use SELECT to preview id 5. UPDATE its status to active, then verify id, name, and status for that row.",
                }),
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolveAutomatedPublicChallengeCopy({
        locale: "en",
        option,
      }),
    ).resolves.toEqual({
      title: "Preview, Update, and Verify a Row",
      prompt:
        "In the inventory_items table, use SELECT to preview id 5. UPDATE its status to active, then verify id, name, and status for that row.",
      source: "ai",
    });

    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as {
      input: string;
      instructions: string;
    };

    expect(request.input).toContain("inventory_items");
    expect(request.input).toContain("CREATE TABLE inventory_items");
    expect(request.input).toContain("Water Bottle");
    expect(request.input).toContain("SELECT id, name, status");
    expect(request.input).toContain("UPDATE inventory_items");
    expect(request.input).toContain('"requiredFacts"');
    expect(request.instructions).toContain(
      "Never reveal a complete executable solution",
    );
  });

  it("uses a context-aware deterministic fallback when AI is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network unavailable")),
    );

    const result =
      await resolveAutomatedPublicChallengeCopy({
        locale: "en",
        option,
      });

    expect(result.source).toBe("fallback");
    expect(result.title).toBe(
      "Preview, Update, Verify One Row",
    );
    expect(result.prompt).toContain("inventory_items");
    expect(result.prompt).toContain("id = 5");
    expect(result.prompt).toContain("active");
    expect(result.prompt.length).toBeLessThanOrEqual(320);
  });

  it("rejects AI copy that loses required exercise facts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    title: "Update a Database Row",
                    prompt:
                      "Change a row and check that the update worked.",
                  }),
                },
              ],
            },
          ],
        }),
      }),
    );

    const result =
      await resolveAutomatedPublicChallengeCopy({
        locale: "en",
        option,
      });

    expect(result.source).toBe("fallback");
    expect(result.prompt).toContain("inventory_items");
  });
});
