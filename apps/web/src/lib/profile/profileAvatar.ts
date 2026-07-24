export const PROFILE_AVATAR_MAX_BYTES = 4 * 1024 * 1024;

export const PROFILE_AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

const PROFILE_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ProfileAvatarFileLike = {
  type: string;
  size: number;
};

export function profileAvatarFileError(file: ProfileAvatarFileLike) {
  if (!PROFILE_AVATAR_TYPES.has(file.type)) {
    return "Choose a JPEG, PNG, or WebP image.";
  }

  if (file.size <= 0) {
    return "The selected image is empty.";
  }

  if (file.size > PROFILE_AVATAR_MAX_BYTES) {
    return "Profile images must be 4 MB or smaller.";
  }

  return null;
}
