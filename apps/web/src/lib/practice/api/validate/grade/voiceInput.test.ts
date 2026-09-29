import { describe, expect, it } from "vitest";

import { gradeVoiceInput } from "./voiceInput";

function grade(args: {
  expectedCanon: any;
  transcript: string;
}) {
  return gradeVoiceInput({
    instance: {} as any,
    expectedCanon: args.expectedCanon,
    answer: {
      kind: "voice_input",
      transcript: args.transcript,
    } as any,
    isReveal: false,
  });
}

describe("gradeVoiceInput", () => {
  it("grades the canonical language targetText field", () => {
    expect(
      grade({
        expectedCanon: {
          kind: "voice_input",
          targetText: "Mari, kijan ou ye?",
        },
        transcript: "MARI, KIJAN OU YE?",
      }),
    ).toEqual({
      ok: true,
      explanation: "Correct.",
    });
  });

  it("rejects an unrelated non-empty transcript", () => {
    expect(
      grade({
        expectedCanon: {
          kind: "voice_input",
          targetText: "Mari, kijan ou ye?",
        },
        transcript: "hhhh",
      }),
    ).toEqual({
      ok: false,
      explanation: "Not correct.",
    });
  });

  it("fails closed when the expected phrase is missing", () => {
    expect(
      grade({
        expectedCanon: {
          kind: "voice_input",
        },
        transcript: "anything",
      }),
    ).toEqual({
      ok: false,
      explanation: "Server bug: missing voice_input expected phrase.",
    });
  });
  it("accepts a close transcript at the shared 60% phrase-match threshold", () => {
    const result = grade({
      expectedCanon: {
        kind: "voice_input",
        targetText: "Mari, kijan ou ye?",
        locale: "ht-HT",
      },
      transcript: "Mari kijan ou",
    });

    expect(result).toEqual({
      ok: true,
      explanation: "Correct.",
    });
  });

});
