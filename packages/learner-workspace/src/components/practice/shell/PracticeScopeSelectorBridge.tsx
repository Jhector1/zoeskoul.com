"use client";

import React, { createContext, useContext } from "react";

export type PracticeScopeSelectorMessageKey =
  | "chooseModule"
  | "chooseSubject"
  | "dailyFallback"
  | "fixed"
  | "loadingSubjects"
  | "locked"
  | "module"
  | "scopeTitle"
  | "subject"
  | "subjectsUnavailable"
  | "subscriber";

export type PracticeScopeSelectorBridgeValue = {
  t: (key: PracticeScopeSelectorMessageKey) => string;
  resolveText: (
    value: string | undefined,
    fallback: string,
  ) => string;
  pushRoute: (
    href: string,
    options?: { scroll?: boolean },
  ) => void;
};

const PracticeScopeSelectorBridgeContext =
  createContext<PracticeScopeSelectorBridgeValue | null>(null);

export function PracticeScopeSelectorBridgeProvider({
  value,
  children,
}: {
  value: PracticeScopeSelectorBridgeValue;
  children: React.ReactNode;
}) {
  return (
    <PracticeScopeSelectorBridgeContext.Provider value={value}>
      {children}
    </PracticeScopeSelectorBridgeContext.Provider>
  );
}

export function usePracticeScopeSelectorBridge():
  PracticeScopeSelectorBridgeValue {
  const value = useContext(PracticeScopeSelectorBridgeContext);

  if (!value) {
    throw new Error(
      "PracticeScopeSelectorBridgeProvider is required",
    );
  }

  return value;
}
