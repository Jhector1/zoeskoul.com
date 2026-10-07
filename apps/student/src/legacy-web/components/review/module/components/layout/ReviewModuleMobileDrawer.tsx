"use client";
import React from "react";
import ModuleSidebar from "../../components/ModuleSidebar";
import Shared from "@zoeskoul/learner-workspace/review/components/layout/ReviewModuleMobileDrawer";
type Props = Omit<React.ComponentProps<typeof Shared>, "sidebar"> & { sidebarProps: React.ComponentProps<typeof ModuleSidebar> };
export default function ReviewModuleMobileDrawer({ sidebarProps, ...props }: Props) {
  return <Shared {...props} sidebar={<ModuleSidebar {...sidebarProps} />} />;
}
