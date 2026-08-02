import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { cloudinaryImageUrlMock } = vi.hoisted(() => ({
  cloudinaryImageUrlMock: vi.fn(),
}));

vi.mock("@/lib/cloudinary/url", () => ({
  cloudinaryImageUrl: cloudinaryImageUrlMock,
}));

import { withResolvedCatalogImage } from "./catalogImagePresentation";

describe("withResolvedCatalogImage", () => {
  beforeEach(() => {
    cloudinaryImageUrlMock.mockReset();
  });

  it("keeps catalogs without an image public ID on the title-initial fallback", () => {
    const catalog = {
      slug: "linux",
      imagePublicId: null,
    };

    expect(withResolvedCatalogImage(catalog)).toEqual({
      ...catalog,
      imageUrl: null,
    });
    expect(cloudinaryImageUrlMock).not.toHaveBeenCalled();
  });

  it("returns the resolved Cloudinary URL without changing catalog fields", () => {
    cloudinaryImageUrlMock.mockReturnValue(
      "https://res.cloudinary.com/example/image/upload/catalog.png",
    );

    const catalog = {
      slug: "python",
      title: "Python",
      imagePublicId: "catalogs/python",
    };

    expect(withResolvedCatalogImage(catalog)).toEqual({
      ...catalog,
      imageUrl:
        "https://res.cloudinary.com/example/image/upload/catalog.png",
    });
    expect(cloudinaryImageUrlMock).toHaveBeenCalledWith(
      "catalogs/python",
      {
        w: 240,
        h: 240,
        crop: "fill",
        gravity: "auto",
        quality: "auto",
        format: "auto",
        dpr: "auto",
      },
    );
  });

  it("preserves the legacy default image when URL resolution fails", () => {
    cloudinaryImageUrlMock.mockReturnValue(null);

    const catalog = {
      slug: "c",
      imagePublicId: "catalogs/c",
    };

    expect(withResolvedCatalogImage(catalog)).toEqual({
      ...catalog,
      imageUrl: "/subjects/_default.png",
    });
  });
});
