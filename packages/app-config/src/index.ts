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
