"use client";
import React from "react";
import ToolsPanel from "@/components/tools/ToolsPanel";
import Shared from "@zoeskoul/learner-workspace/review/components/layout/ReviewModuleRightRail";
type Props = Omit<React.ComponentProps<typeof Shared>, "toolsPanel"> & { toolsPanelProps: React.ComponentProps<typeof ToolsPanel> };
export default function ReviewModuleRightRail({ toolsPanelProps, ...props }: Props) {
  return <Shared {...props} toolsPanel={<ToolsPanel {...toolsPanelProps} />} />;
}
