import { describe, expect, it } from "vitest";

import {
  PROFILE_AVATAR_MAX_BYTES,
  profileAvatarFileError,
} from "./profileAvatar";

describe("profileAvatarFileError", () => {
  it("accepts supported images within the limit", () => {
    expect(
      profileAvatarFileError({ type: "image/png", size: 1024 }),
    ).toBeNull();
  });

  it("rejects unsupported image formats", () => {
    expect(
      profileAvatarFileError({ type: "image/svg+xml", size: 1024 }),
    ).toBe("Choose a JPEG, PNG, or WebP image.");
  });

  it("rejects images larger than four megabytes", () => {
    expect(
      profileAvatarFileError({
        type: "image/jpeg",
        size: PROFILE_AVATAR_MAX_BYTES + 1,
      }),
    ).toBe("Profile images must be 4 MB or smaller.");
  });
});
