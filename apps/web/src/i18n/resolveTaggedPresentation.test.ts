import { describe, expect, it } from "vitest";

import { loadWebLocaleMessages } from "@/i18n/messages";

import {
  messageAtPath,
  readableTaggedFallback,
  resolveTaggedPresentation,
} from "./resolveTaggedPresentation";

const liveKeys = {
  subjectTitle: "subjects.python-v2.title",
  moduleTitle: "modules.python-v2.python-v2-1.title",
  topicTitle:
    "topics.python-v2.python-v2-1.f-strings-and-formatting.label",
  questionTitle:
    "topics.python-v2.python-v2-1.f-strings-and-formatting.quiz.ci_input_greeting.title",
} as const;

describe("Admin shared tagged presentation resolution", () => {
  it("loads the live subject/module/topic/question keys from canonical Web + curriculum messages", async () => {
    const messages = await loadWebLocaleMessages("en");

    for (const key of Object.values(liveKeys)) {
      const value = messageAtPath(messages, key);
      expect(
        typeof value === "string" && value.trim().length > 0,
        `Expected canonical English message for ${key}`,
      ).toBe(true);
    }
  }, 20_000);

  it("deeply resolves the exact key families that leaked into Admin", async () => {
    const messages = await loadWebLocaleMessages("en");

    const resolved = await resolveTaggedPresentation({
      subjectTitle: `@:${liveKeys.subjectTitle}`,
      moduleTitle: `@:${liveKeys.moduleTitle}`,
      nested: {
        topicTitle: `@:${liveKeys.topicTitle}`,
        questionTitle: `@:${liveKeys.questionTitle}`,
      },
    });

    expect(resolved).toEqual({
      subjectTitle: messageAtPath(messages, liveKeys.subjectTitle),
      moduleTitle: messageAtPath(messages, liveKeys.moduleTitle),
      nested: {
        topicTitle: messageAtPath(messages, liveKeys.topicTitle),
        questionTitle: messageAtPath(messages, liveKeys.questionTitle),
      },
    });

    expect(JSON.stringify(resolved)).not.toContain("@:");
  });

  it("reuses the canonical locale message bundle after the cold load", async () => {
    const first = await loadWebLocaleMessages("en");
    const second = await loadWebLocaleMessages("en");

    expect(second).toEqual(first);
  }, 20_000);

  it("does not load message state at all when the API payload contains no tagged values", async () => {
    await expect(
      resolveTaggedPresentation({
        title: "Already resolved",
        count: 3,
      }),
    ).resolves.toEqual({
      title: "Already resolved",
      count: 3,
    });
  });

  it("humanizes only as a final safety fallback for a genuinely missing key", async () => {
    await expect(
      resolveTaggedPresentation({
        title: "@:topics.not-real.missing-topic.title",
      }),
    ).resolves.toEqual({
      title: "Missing Topic",
    });

    expect(
      readableTaggedFallback(
        "@:topics.python-v2.python-v2-1.f-strings-and-formatting.label",
      ),
    ).toBe("F Strings And Formatting");
  });
});
