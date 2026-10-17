import {
  supportedLocales,
} from "@zoeskoul/app-config";
import {
  notFound,
  redirect,
} from "next/navigation";

export default async function ZoeBuildLocaleRoot({
  params,
}: {
  params: Promise<{
    locale: string;
  }>;
}) {
  const {
    locale,
  } = await params;

  if (
    !supportedLocales.some(
      (supportedLocale) =>
        supportedLocale === locale,
    )
  ) {
    notFound();
  }

  redirect(`/${locale}/projects`);
}
