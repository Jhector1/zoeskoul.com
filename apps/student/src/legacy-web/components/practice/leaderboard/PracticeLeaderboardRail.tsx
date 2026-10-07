"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import SharedPracticeLeaderboardRail from "@zoeskoul/learner-workspace/components/practice/leaderboard/PracticeLeaderboardRail";

type SharedProps = ComponentProps<typeof SharedPracticeLeaderboardRail>;
type Props = Omit<SharedProps, "LinkComponent">;

export default function PracticeLeaderboardRail(props: Props) {
  return (
    <SharedPracticeLeaderboardRail
      {...props}
      LinkComponent={Link}
    />
  );
}
