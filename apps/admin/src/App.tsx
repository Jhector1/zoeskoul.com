import { getLocalAppOrigin } from "@zoeskoul/app-config";

import { AdminAccessGate } from "@/app/AdminAccessGate";
import { AdminShell } from "@/app/AdminShell";

export function App() {
  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ??
    getLocalAppOrigin("website");

  const websiteOrigin =
    import.meta.env.VITE_WEBSITE_ORIGIN ??
    getLocalAppOrigin("website");

  return (
    <AdminAccessGate
      apiOrigin={apiOrigin}
      websiteOrigin={websiteOrigin}
    >
      {(session, access) => (
        <AdminShell
          apiOrigin={apiOrigin}
          websiteOrigin={websiteOrigin}
          session={session}
          access={access}
        />
      )}
    </AdminAccessGate>
  );
}
