import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  saveStudentReviewProgress,
} from "./studentProgressPersistence";

type SaveStudentReviewProgressArgs =
  Parameters<
    typeof saveStudentReviewProgress
  >[0];
type FetchProgress =
  NonNullable<
    SaveStudentReviewProgressArgs["fetchProgress"]
  >;
type SaveProgress =
  NonNullable<
    SaveStudentReviewProgressArgs["saveProgress"]
  >;

describe(
  "student review progress conflict retry",
  () => {
    it(
      "fetches, merges, and retries after a 409 conflict",
      async () => {
        const saveProgress = vi
          .fn<SaveProgress>()
          .mockRejectedValueOnce(
            Object.assign(
              new Error(
                "Review progress conflict",
              ),
              {
                status: 409,
              },
            ),
          )
          .mockResolvedValueOnce({
            state: {
              activeTopicId:
                "list-methods",
              topics: {
                "list-intro": {
                  completed: true,
                },
                "list-methods": {
                  readingDone: {
                    "method-reading": true,
                  },
                },
              },
              __saveRevision: 51,
            },
            data: null,
          });

        const fetchProgress = vi
          .fn<FetchProgress>()
          .mockResolvedValue({
            activeTopicId:
              "list-intro",
            topics: {
              "list-intro": {
                completed: true,
              },
            },
            __saveRevision: 50,
          });

        const result =
          await saveStudentReviewProgress({
            apiOrigin:
              "https://zoeskoul.test",
            subjectSlug: "python",
            moduleSlug: "lists",
            locale: "en",
            state: {
              activeTopicId:
                "list-methods",
              topics: {
                "list-methods": {
                  readingDone: {
                    "method-reading": true,
                  },
                },
              },
              __saveRevision: 49,
            },
            fetchProgress,
            saveProgress,
          });

        expect(fetchProgress)
          .toHaveBeenCalledTimes(1);
        expect(saveProgress)
          .toHaveBeenCalledTimes(2);

        const retryPayload =
          saveProgress.mock.calls[1]?.[0]
            ?.payload;

        expect(retryPayload.state)
          .toMatchObject({
            activeTopicId:
              "list-methods",
            topics: {
              "list-intro": {
                completed: true,
              },
              "list-methods": {
                readingDone: {
                  "method-reading": true,
                },
              },
            },
          });

        expect(result.state.topics)
          .toMatchObject({
            "list-intro": {
              completed: true,
            },
          });
      },
    );

    it(
      "does not retry a non-conflict failure",
      async () => {
        const saveProgress = vi
          .fn<SaveProgress>()
          .mockRejectedValue(
            Object.assign(
              new Error("Server error"),
              {
                status: 500,
              },
            ),
          );
        const fetchProgress =
          vi.fn<FetchProgress>();

        await expect(
          saveStudentReviewProgress({
            apiOrigin:
              "https://zoeskoul.test",
            subjectSlug: "python",
            moduleSlug: "lists",
            locale: "en",
            state: {
              topics: {},
            },
            fetchProgress,
            saveProgress,
          }),
        ).rejects.toThrow(
          "Server error",
        );

        expect(fetchProgress)
          .not.toHaveBeenCalled();
        expect(saveProgress)
          .toHaveBeenCalledTimes(1);
      },
    );
  },
);
