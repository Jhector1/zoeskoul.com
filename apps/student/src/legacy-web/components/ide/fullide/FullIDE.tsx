"use client";

import React from "react";
import SharedFullIDE from "@zoeskoul/learner-workspace/fullide/FullIDE";
import { LearnerWorkspaceAppRuntimeProvider } from "./appAdapter";

export default function FullIDE(
  props: React.ComponentProps<typeof SharedFullIDE>,
) {
  return (
    <LearnerWorkspaceAppRuntimeProvider>
      <SharedFullIDE {...props} />
    </LearnerWorkspaceAppRuntimeProvider>
  );
}
