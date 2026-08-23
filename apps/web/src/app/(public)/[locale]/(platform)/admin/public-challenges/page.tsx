import {
  getLocalAppOrigin,
  getProductionAppOrigin,
} from "@zoeskoul/app-config";
import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function PublicChallengesCompatibilityPage({
  params,
}: PageProps) {
  const { locale } = await params;
  const adminOrigin =
    process.env.NODE_ENV === "development"
      ? getLocalAppOrigin("admin")
      : getProductionAppOrigin("admin");

  const target = new URL("/public-challenges", adminOrigin);
  target.searchParams.set("locale", locale || "en");

  redirect(target.toString());
}
