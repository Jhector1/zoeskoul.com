export const zoeSkoulApps = {
  website: {
    id: "website",
    label: "ZoeSkoul",
    localPort: 3000,
  },
  admin: {
    id: "admin",
    label: "ZoeSkoul Admin",
    localPort: 3001,
  },
  student: {
    id: "student",
    label: "ZoeSkoul Student",
    localPort: 3002,
  },
  teacher: {
    id: "teacher",
    label: "ZoeSkoul Teacher",
    localPort: 3003,
  },
} as const;

export type ZoeSkoulAppId = keyof typeof zoeSkoulApps;

export function getLocalAppOrigin(appId: ZoeSkoulAppId): string {
  return `http://localhost:${zoeSkoulApps[appId].localPort}`;
}
