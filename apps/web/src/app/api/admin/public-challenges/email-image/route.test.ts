import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveChallengePublisherAccessMock,
  uploadChallengeOgImageMock,
  cloudinaryServerImageUrlMock,
} = vi.hoisted(() => ({
  resolveChallengePublisherAccessMock: vi.fn(),
  uploadChallengeOgImageMock: vi.fn(),
  cloudinaryServerImageUrlMock: vi.fn(),
}));

vi.mock("@/lib/practice/challenges/publisherAccess", () => ({
  resolveChallengePublisherAccess: resolveChallengePublisherAccessMock,
}));

vi.mock("@/lib/cloudinary/server", () => ({
  uploadChallengeOgImage: uploadChallengeOgImageMock,
  cloudinaryServerImageUrl: cloudinaryServerImageUrlMock,
}));

vi.mock("@/lib/http/appCors", () => ({
  isAppOriginAllowed: vi.fn(() => true),
  appCorsJson: vi.fn(
    (_request: Request, body: unknown, init?: ResponseInit) =>
      Response.json(body, init),
  ),
  appCorsPreflight: vi.fn(() => new Response(null, { status: 204 })),
}));

import { POST } from "./route";

describe("admin public challenge email image upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveChallengePublisherAccessMock.mockResolvedValue({
      authenticated: true,
      allowed: true,
      userId: "publisher-1",
      email: "publisher@example.com",
    });
    uploadChallengeOgImageMock.mockResolvedValue({
      publicId: "zoeskoul/challenges/email-preview-1",
    });
    cloudinaryServerImageUrlMock.mockReturnValue(
      "https://res.cloudinary.com/demo/image/upload/email-preview-1.jpg",
    );
  });

  it("reuses the canonical challenge image uploader and returns a remote URL", async () => {
    const form = new FormData();
    form.set(
      "image",
      new File(["png"], "preview.png", { type: "image/png" }),
    );

    const response = await POST(
      new Request(
        "https://zoeskoul.com/api/admin/public-challenges/email-image",
        {
          method: "POST",
          body: form,
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      imageUrl:
        "https://res.cloudinary.com/demo/image/upload/email-preview-1.jpg",
    });

    expect(uploadChallengeOgImageMock).toHaveBeenCalledTimes(1);
    expect(cloudinaryServerImageUrlMock).toHaveBeenCalledWith(
      "zoeskoul/challenges/email-preview-1",
      {
        w: 1200,
        h: 630,
        crop: "fill",
        gravity: "auto",
        quality: "auto",
        format: "jpg",
      },
    );
  });

  it("rejects a missing image", async () => {
    const response = await POST(
      new Request(
        "https://zoeskoul.com/api/admin/public-challenges/email-image",
        {
          method: "POST",
          body: new FormData(),
        },
      ),
    );

    expect(response.status).toBe(400);
    expect(uploadChallengeOgImageMock).not.toHaveBeenCalled();
  });
});
