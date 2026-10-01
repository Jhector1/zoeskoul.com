import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  published: vi.fn(),
  getTranslations: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock(
  "@/lib/practice/challenges/presentation",
  () => ({
    DEFAULT_PUBLIC_CHALLENGE_DESCRIPTION:
      "Can you complete this coding practice challenge? No account is required to try it.",
  }),
);

vi.mock(
  "@/lib/practice/challenges/publishedCatalog",
  () => ({
    listPublishedChallengeExerciseOptions:
      mocks.published,
  }),
);

vi.mock(
  "next-intl/server",
  () => ({
    getTranslations:
      mocks.getTranslations,
  }),
);

let resolvePublicChallengeSocialDescription:
  typeof import(
    "./publicChallengeSocialCopy"
  ).resolvePublicChallengeSocialDescription;

beforeAll(async () => {
  ({
    resolvePublicChallengeSocialDescription,
  } = await import(
    "./publicChallengeSocialCopy"
  ));
});

beforeEach(() => {
  vi.clearAllMocks();
});

const legacyChallenge = {
  locale: "en",
  subjectSlug: "python-v2",
  moduleSlug: "python-v2-4",
  sectionSlug: "classes",
  exerciseKey:
    "ci-methods-responsibility-report-line",
  shareDescription:
    "Can you complete this coding practice challenge? No account is required to try it.",
};

describe(
  "public challenge social description",
  () => {
    it(
      "replaces the legacy generic description with the authored prompt",
      async () => {
        mocks.published.mockResolvedValue([
          {
            subjectSlug: "python-v2",
            moduleSlug: "python-v2-4",
            sectionSlug: "classes",
            exerciseKey:
              "ci-methods-responsibility-report-line",
            exercisePrompt:
              "Create the report line by calling the account instance method after updating the balance.",
          },
        ]);

        await expect(
          resolvePublicChallengeSocialDescription(
            legacyChallenge,
          ),
        ).resolves.toBe(
          "Create the report line by calling the account instance method after updating the balance.",
        );
      },
    );

    it(
      "resolves tagged authored prompts using the challenge locale",
      async () => {
        mocks.published.mockResolvedValue([
          {
            subjectSlug: "python-v2",
            moduleSlug: "python-v2-4",
            sectionSlug: "classes",
            exerciseKey:
              "ci-methods-responsibility-report-line",
            exercisePrompt:
              "@:topics.classes.reportLine.prompt",
          },
        ]);

        mocks.getTranslations.mockResolvedValue(
          ((key: string) =>
            key ===
            "topics.classes.reportLine.prompt"
              ? "Build the account report line using the authored class method."
              : key) as any,
        );

        await expect(
          resolvePublicChallengeSocialDescription(
            legacyChallenge,
          ),
        ).resolves.toBe(
          "Build the account report line using the authored class method.",
        );

        expect(
          mocks.getTranslations,
        ).toHaveBeenCalledWith({
          locale: "en",
        });
      },
    );

    it(
      "preserves an explicitly customized share description",
      async () => {
        await expect(
          resolvePublicChallengeSocialDescription({
            ...legacyChallenge,
            shareDescription:
              "Practice instance methods by updating an account and printing its report line.",
          }),
        ).resolves.toBe(
          "Practice instance methods by updating an account and printing its report line.",
        );

        expect(
          mocks.published,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
