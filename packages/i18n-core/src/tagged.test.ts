import {
  describe,
  expect,
  it,
} from "vitest";

import {
  I18N_TAG,
  isTaggedKey,
  stripTag,
  toText,
} from "./tagged";

describe("tagged i18n primitives", () => {
  it("recognizes valid tagged translation keys", () => {
    expect(I18N_TAG).toBe("@:");

    expect(
      isTaggedKey(
        "@:subjects.python.title",
      ),
    ).toBe(true);

    expect(
      isTaggedKey(
        "@:review:item-1",
      ),
    ).toBe(true);
  });

  it("rejects untagged or invalid keys", () => {
    expect(
      isTaggedKey(
        "subjects.python.title",
      ),
    ).toBe(false);

    expect(
      isTaggedKey("@:"),
    ).toBe(false);

    expect(
      isTaggedKey(
        "@:bad key",
      ),
    ).toBe(false);

    expect(
      isTaggedKey(null),
    ).toBe(false);
  });

  it("removes the tag prefix", () => {
    expect(
      stripTag(
        "@:subjects.python.title",
      ),
    ).toBe(
      "subjects.python.title",
    );
  });

  it("normalizes translation output to text", () => {
    expect(toText("hello")).toBe("hello");
    expect(toText(42)).toBe("42");
    expect(
      toText(null, "fallback"),
    ).toBe("fallback");
  });
});
