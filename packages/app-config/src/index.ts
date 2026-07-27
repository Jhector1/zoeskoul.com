export const zoeSkoulApps = {
  website: {
    id: "website",
    label: "ZoeSkoul",
    localPort: 3000,
    productionOrigin: "https://zoeskoul.com",
  },
  admin: {
    id: "admin",
    label: "ZoeSkoul Admin",
    localPort: 3001,
    productionOrigin: "https://admin.zoeskoul.com",
  },
  student: {
    id: "student",
    label: "ZoeSkoul Student",
    localPort: 3002,
    productionOrigin: "https://student.zoeskoul.com",
  },
  teacher: {
    id: "teacher",
    label: "ZoeSkoul Teacher",
    localPort: 3003,
    productionOrigin: "https://teacher.zoeskoul.com",
  },
} as const;

export type ZoeSkoulAppId = keyof typeof zoeSkoulApps;

export const browserAppIds = [
  "admin",
  "student",
  "teacher",
] as const satisfies readonly ZoeSkoulAppId[];

export type ZoeSkoulBrowserAppId = (typeof browserAppIds)[number];

export function getLocalAppOrigin(appId: ZoeSkoulAppId): string {
  return `http://localhost:${zoeSkoulApps[appId].localPort}`;
}

export function getProductionAppOrigin(appId: ZoeSkoulAppId): string {
  return zoeSkoulApps[appId].productionOrigin;
}

export function getTrustedBrowserAppOrigins(args?: {
  includeLocal?: boolean;
}): string[] {
  const origins = browserAppIds.map(getProductionAppOrigin);

  if (args?.includeLocal) {
    origins.push(...browserAppIds.map(getLocalAppOrigin));
  }

  return origins;
}

export function isTrustedBrowserAppOrigin(
  origin: string,
  args?: {
    includeLocal?: boolean;
  },
): boolean {
  return getTrustedBrowserAppOrigins(args).includes(origin);
}
