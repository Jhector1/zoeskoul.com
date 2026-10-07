"use client";

import React from "react";
import MobileDrawer from "./MobileDrawer";

export type ReviewModuleMobileDrawerProps = {
  open: boolean;
  reduceMotion: boolean;
  onClose: () => void;
  padStyle: React.CSSProperties;
  sidebar: React.ReactNode;
};

export default function ReviewModuleMobileDrawer({
  open,
  reduceMotion,
  onClose,
  padStyle,
  sidebar,
}: ReviewModuleMobileDrawerProps) {
  return (
    <MobileDrawer
      open={open}
      side="left"
      title="Topics"
      reduceMotion={reduceMotion}
      onClose={onClose}
    >
      <div className="p-3" style={padStyle}>
        {sidebar}
      </div>
    </MobileDrawer>
  );
}
