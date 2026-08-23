/**
 * Canonical browser-safe Public Challenge helpers shared by the
 * Admin publisher and Web challenge runtime compatibility surface.
 * No database, filesystem, auth, Next, or app-local imports belong here.
 */

export type PublicChallengeEligibilityTarget = {
  exerciseKind: unknown;
};

/**
 * Browser-safe Public Challenge execution-shape guard.
 *
 * Authored Practice eligibility is owned by the existing server-side
 * isAuthoredLessonPracticeOption concern. Do not duplicate purpose or
 * lesson-scope policy here.
 */
export function isEligiblePublicChallengeTarget(
  target: PublicChallengeEligibilityTarget,
): boolean {
  return String(target.exerciseKind ?? "").trim() === "code_input";
}

export function assertEligiblePublicChallengeTarget(
  target: PublicChallengeEligibilityTarget,
): void {
  if (isEligiblePublicChallengeTarget(target)) return;

  throw new Error(
    `Only code_input exercises can be shared as public challenges. Received kind "${String(
      target.exerciseKind ?? "unknown",
    )}".`,
  );
}

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
