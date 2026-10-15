import { createPlatformAuth } from "@zoeskoul/platform-auth";
import { prisma } from "@zoeskoul/platform-server/prisma";

export const { handlers, auth, signIn, signOut } = createPlatformAuth({
  prisma,
  signInPath: "/authenticate",
});
