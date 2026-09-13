"use client";

import React from "react";
import SharedCodeRunner from "@zoeskoul/learner-workspace/runner/CodeRunner";
import { LearnerWorkspaceAppRuntimeProvider } from "@/components/ide/fullide/appAdapter";

export * from "@zoeskoul/learner-workspace/runner/CodeRunner";

export default function CodeRunner(
  props: React.ComponentProps<typeof SharedCodeRunner>,
) {
  return (
    <LearnerWorkspaceAppRuntimeProvider>
      <SharedCodeRunner {...props} />
    </LearnerWorkspaceAppRuntimeProvider>
  );
}
