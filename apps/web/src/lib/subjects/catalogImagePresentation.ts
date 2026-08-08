import {
  cloudinaryImageUrl,
} from "@zoeskoul/learner-ui/lib/cloudinary/url";

export type CatalogImageSource = {
  imagePublicId: string | null;
};

export type CatalogWithResolvedImage<
  T extends CatalogImageSource,
> = T & {
  imageUrl: string | null;
};

export function withResolvedCatalogImage<
  T extends CatalogImageSource,
>(
  catalog: T,
): CatalogWithResolvedImage<T> {
  const imageUrl = catalog.imagePublicId
    ? cloudinaryImageUrl(catalog.imagePublicId, {
        w: 240,
        h: 240,
        crop: "fill",
        gravity: "auto",
        quality: "auto",
        format: "auto",
        dpr: "auto",
      }) ?? "/subjects/_default.png"
    : null;

  return {
    ...catalog,
    imageUrl,
  };
}
