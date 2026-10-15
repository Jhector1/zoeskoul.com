import { buildCloudinaryImageUrl } from "./lib/cloudinary/url";

const ZOESKOUL_CLOUDINARY_CLOUD_NAME = "dqeqbgxvn";
const ZOESKOUL_LOGO_PUBLIC_ID = "zoeskoul-logo_ttq9pf-design";
const ZOESKOUL_LOGO_VERSION = 1787627595;

export function ZoeSkoulLogoMark() {
  const src = buildCloudinaryImageUrl(
    ZOESKOUL_CLOUDINARY_CLOUD_NAME,
    ZOESKOUL_LOGO_PUBLIC_ID,
    {
      w: 72,
      crop: "fit",
      format: "auto",
      quality: "auto",
      dpr: "auto",
      v: ZOESKOUL_LOGO_VERSION,
    },
  );

  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg"
      aria-hidden="true"
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 object-contain"
          decoding="async"
        />
      ) : (
        <span className="text-sm font-semibold text-neutral-900 dark:text-white/90">
          L
        </span>
      )}
    </span>
  );
}
