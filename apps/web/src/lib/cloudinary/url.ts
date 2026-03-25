type CloudinaryImageOpts = {
  w?: number;
  h?: number;
  crop?: "fill" | "fit" | "scale" | "crop";
  gravity?: "auto" | "center" | "faces";
  quality?: "auto" | number;
  format?: "auto" | "webp" | "jpg" | "png";
  dpr?: "auto" | number;
  v?: string | number;
};

function encPublicId(publicId: string) {
  return encodeURIComponent(publicId).replace(/%2F/g, "/");
}

export function cloudinaryImageUrl(publicId: string, opts: CloudinaryImageOpts = {}) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return "";

  const {
    w = 1200,
    h,
    crop = "fill",
    gravity = "auto",
    quality = "auto",
    format = "auto",
    dpr = "auto",
    v,
  } = opts;

  const trParts: string[] = [`f_${format}`, `q_${quality}`, `c_${crop}`, `w_${w}`, `dpr_${dpr}`];

  // Only include gravity when it matters
  if ((crop === "fill" || crop === "crop") && gravity) trParts.push(`g_${gravity}`);

  // Only include height when it makes sense (prevents unexpected aspect behavior)
  if (typeof h === "number" && (crop === "fill" || crop === "crop")) trParts.push(`h_${h}`);

  const tr = trParts.join(",");

  const versionSeg = v ? `v${v}/` : "";

  return `https://res.cloudinary.com/${cloudName}/image/upload/${tr}/${versionSeg}${encPublicId(
    publicId,
  )}`;
}
