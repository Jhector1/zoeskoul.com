/* eslint-disable @typescript-eslint/no-explicit-any */

function unavailable(): never {
  throw new Error(
    "Prisma is server-only. Use a student API/client contract in the browser.",
  );
}

const serverOnlyProxy: any = new Proxy(unavailable, {
  get() {
    return serverOnlyProxy;
  },
  apply() {
    return unavailable();
  },
});

export type PrismaClient = any;
export const Prisma: any = serverOnlyProxy;
export const prisma: PrismaClient = serverOnlyProxy;

export function getPrismaClient(): PrismaClient {
  return serverOnlyProxy;
}
