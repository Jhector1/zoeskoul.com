export const CHALLENGE_SHARE_IMAGE_WIDTH = 1200;
export const CHALLENGE_SHARE_IMAGE_HEIGHT = 630;

export type ChallengeShareCoverCrop = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
};

export function computeChallengeShareCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth = CHALLENGE_SHARE_IMAGE_WIDTH,
  targetHeight = CHALLENGE_SHARE_IMAGE_HEIGHT,
): ChallengeShareCoverCrop {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    !Number.isFinite(targetWidth) ||
    !Number.isFinite(targetHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    throw new Error("Screenshot dimensions must be positive finite numbers.");
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    const croppedWidth = sourceHeight * targetAspect;
    return {
      sourceX: (sourceWidth - croppedWidth) / 2,
      sourceY: 0,
      sourceWidth: croppedWidth,
      sourceHeight,
    };
  }

  const croppedHeight = sourceWidth / targetAspect;
  return {
    sourceX: 0,
    sourceY: (sourceHeight - croppedHeight) / 2,
    sourceWidth,
    sourceHeight: croppedHeight,
  };
}

export function challengeScreenshotFilename(exerciseKey: string) {
  const safe = String(exerciseKey ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${safe || "challenge"}-preview.png`;
}
