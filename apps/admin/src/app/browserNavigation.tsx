import { useEffect, useMemo, useState } from "react";

import {
  AdminLink,
  navigateAdmin,
} from "@/app/navigation";

export const Link = AdminLink;

export function useRouter() {
  return useMemo(
    () => ({
      push(href: string) {
        navigateAdmin(href);
      },
      replace(href: string) {
        navigateAdmin(href, { replace: true });
      },
      refresh() {
        window.location.reload();
      },
    }),
    [],
  );
}

export function useSearchParams() {
  const [search, setSearch] = useState(() => window.location.search);

  useEffect(() => {
    const sync = () => setSearch(window.location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return useMemo(() => new URLSearchParams(search), [search]);
}
