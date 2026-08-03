import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createStudentPracticeClient,
} from "./index";

const target = {
  version: 1 as const,
  sectionSlug: "section-1",
  topicSlug: "topic-1",
  ownerCardId: "quiz-1",
  targetKind: "card" as const,
  targetId: "quiz-1",
  runtimeKind: "quiz" as const,
};

describe("student practice client", () => {
  it("loads an exact practice launch", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        Response.json({
          target,
          title: "Quick check",
          exercise: {
            id: "exercise-1",
            exerciseKey:
              "exercise-1",
            kind:
              "single_choice",
            title: "Question",
            prompt: "Choose one.",
            topic: "topic-1",
            difficulty: "easy",
            payload: {
              options: [],
            },
          },
          key:
            "signed-practice-key-123456",
          sessionId: null,
          run: null,
          validationPath:
            "/api/student/runtime/practice/validate",
        }),
    );

    const client =
      createStudentPracticeClient({
        apiOrigin:
          "http://localhost:3000",
        fetchImpl:
          fetchImpl as typeof fetch,
      });

    const result =
      await client.launch({
        subjectSlug: "python",
        moduleSlug: "module-1",
        target,
      });

    expect(result.target).toEqual(
      target,
    );

    const [
      requestUrl,
      requestInit,
    ] = fetchImpl.mock.calls[0];

    expect(
      String(requestUrl),
    ).toContain(
      "/runtime/practice?",
    );
    expect(
      requestInit?.credentials,
    ).toBe("include");
  });

  it("submits only the signed key and simple answer", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        Response.json({
          ok: true,
          message: null,
          code: null,
          explanation:
            "Correct.",
          feedback: null,
          finalized: true,
          duplicate: false,
          attempts: {
            used: 1,
            max: null,
            left: null,
          },
          sessionComplete: false,
          requestId: "request-1",
        }),
    );

    const client =
      createStudentPracticeClient({
        apiOrigin:
          "http://localhost:3000",
        fetchImpl:
          fetchImpl as typeof fetch,
      });

    await client.validate({
      key:
        "signed-practice-key-123456",
      answer: {
        kind: "numeric",
        value: 42,
      },
      submissionId:
        "submission-1",
    });

    const [
      requestUrl,
      requestInit,
    ] = fetchImpl.mock.calls[0];

    expect(String(requestUrl)).toBe(
      "http://localhost:3000/api/student/runtime/practice/validate",
    );
    expect(
      JSON.parse(
        String(requestInit?.body),
      ),
    ).toEqual({
      key:
        "signed-practice-key-123456",
      answer: {
        kind: "numeric",
        value: 42,
      },
      submissionId:
        "submission-1",
    });
  });

  it("submits the signed key and one-file code-input answer", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        Response.json({
          ok: true,
          message: null,
          code: null,
          explanation: "Correct.",
          feedback: null,
          finalized: true,
          duplicate: false,
          attempts: { used: 1, max: null, left: null },
          sessionComplete: false,
          requestId: "request-2",
        }),
    );

    const client = createStudentPracticeClient({
      apiOrigin: "http://localhost:3000",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await client.validate({
      key: "signed-practice-key-123456",
      answer: {
        kind: "code_input",
        language: "python",
        code: "print('Ava')\n",
        entry: "main.py",
        files: [
          {
            kind: "file",
            path: "main.py",
            content: "print('Ava')\n",
          },
        ],
      },
      submissionId: "submission-2",
    });

    const [, requestInit] = fetchImpl.mock.calls[0];

    expect(JSON.parse(String(requestInit?.body))).toEqual({
      key: "signed-practice-key-123456",
      answer: {
        kind: "code_input",
        language: "python",
        code: "print('Ava')\n",
        entry: "main.py",
        files: [
          {
            kind: "file",
            path: "main.py",
            content: "print('Ava')\n",
          },
        ],
      },
      submissionId: "submission-2",
    });
  });

});
