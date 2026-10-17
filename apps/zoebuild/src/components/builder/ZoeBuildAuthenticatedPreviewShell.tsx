"use client";

import type {
  ReactNode,
} from "react";
import {
  usePathname,
} from "next/navigation";
import {
  useAppSession,
} from "@zoeskoul/auth-client/react";

import {
  PersistentReactPreviewProvider,
} from "@/components/builder/PersistentReactPreviewHost";

/**
 * The editor preview belongs to the authenticated ZoeBuild application,
 * not to one route subtree.
 *
 * Keep the same browser iframe parked across Home, Projects, Builder,
 * Commerce, and future signed-in ZoeBuild pages. Fail closed when the
 * canonical Web-owned session is not authenticated.
 */
function isPreviewIsolatedPath(
  pathname: string,
) {
  return (
    pathname === "/authenticate" ||
    pathname.startsWith(
      "/authenticate/",
    ) ||
    pathname === "/health" ||
    pathname.startsWith(
      "/health/",
    ) ||
    pathname === "/api" ||
    pathname.startsWith(
      "/api/",
    ) ||
    pathname === "/sites" ||
    pathname.startsWith(
      "/sites/",
    )
  );
}

export function ZoeBuildAuthenticatedPreviewShell(
  props: Readonly<{
    children: ReactNode;
    apiOrigin: string;
  }>,
) {
  const pathname =
    usePathname() || "/";

  const sessionState =
    useAppSession({
      apiOrigin:
        props.apiOrigin,
    });

  const previewEnabled =
    sessionState.status ===
      "authenticated" &&
    !isPreviewIsolatedPath(
      pathname,
    );

  return (
    <PersistentReactPreviewProvider
      enabled={previewEnabled}
    >
      {props.children}
    </PersistentReactPreviewProvider>
  );
}
