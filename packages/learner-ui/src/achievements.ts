export type FinishState = {
  status:
    | "in_progress"
    | "more_coming"
    | "reward_ready"
    | "certificate_ready"
    | "certificate_issued";
  message: string | null;
  rewardEligible: boolean;
  certificateEligible: boolean;
  certificateIssued: boolean;
  curriculumComplete: boolean;
};

export type AchievementReward = {
  badgeLabel?: string | null;
  badgeDescription?: string | null;
  capstoneHref?: string | null;
  subjectHref?: string | null;
  certificateHref?: string | null;
};

export type AchievementItem = {
  subject: {
    id: string;
    slug: string;
    title: string;
    order: number;
    imagePublicId: string | null;
    imageAlt: string | null;
  };
  enrollment: {
    status: "enrolled" | "completed";
    startedAt: string;
    lastSeenAt: string | null;
    completedAt: string | null;
  };
  requireAssignment: boolean;
  eligible: boolean;
  completedAt: string | null;
  progress: {
    modulesTotal: number;
    modulesDone: number;
    assignmentsDone: number;
    percent: number;
  };
  modules: Array<{
    moduleId: string;
    title: string;
    order: number;
    moduleCompleted: boolean;
    assignmentCompleted: boolean;
    completedAt: string | null;
    updatedAt: string | null;
  }>;
  certificate: {
    id: string;
    issuedAt: string;
    completedAt: string | null;
  } | null;
  finishState?: FinishState | null;
  reward?: AchievementReward | null;
};

export type AchievementsPayload = {
  locale: string;
  actor: {
    isGuest: boolean;
    userId: string | null;
    guestId: string | null;
  };
  items: AchievementItem[];
};

export function isRewardUnlocked(item: AchievementItem) {
  const status = item.finishState?.status;
  return (
    Boolean(item.finishState?.rewardEligible) ||
    status === "reward_ready" ||
    status === "certificate_ready" ||
    status === "certificate_issued"
  );
}

export function isCertificateUnlocked(item: AchievementItem) {
  const status = item.finishState?.status;
  return (
    Boolean(item.certificate) ||
    Boolean(item.finishState?.certificateEligible) ||
    status === "certificate_ready" ||
    status === "certificate_issued"
  );
}

export function isMoreComing(item: AchievementItem) {
  return item.finishState?.status === "more_coming";
}

export function buildAchievementBuckets(items: AchievementItem[]) {
  const certificates = items.filter(isCertificateUnlocked);
  const rewards = items.filter(
    (item) => isRewardUnlocked(item) && !isCertificateUnlocked(item),
  );
  const badges = items.filter(isRewardUnlocked);
  const moreComing = items.filter(isMoreComing);
  const inProgress = items.filter(
    (item) =>
      !isCertificateUnlocked(item) &&
      !isRewardUnlocked(item) &&
      !isMoreComing(item) &&
      item.enrollment.status !== "completed",
  );

  return { certificates, rewards, badges, moreComing, inProgress };
}

export function clampAchievementPercentage(value: number) {
  return Math.max(0, Math.min(100, value));
}
