"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { UserMenuChrome } from "@zoeskoul/learner-ui";
import { Link } from "@/i18n/navigation";

type Props = {
  name: string;
  email?: string | null;
  image?: string | null;
  profileHref?: string;
  onSignOut: () => void;
};

export default function StudentUserMenuSlick({
  name,
  email,
  image,
  profileHref = "/profile",
  onSignOut,
}: Props) {
  const t = useTranslations("UserMenu");

  return (
    <UserMenuChrome
      name={name}
      email={email}
      profileHref={profileHref}
      ariaLabel={t("ariaLabel")}
      profileLabel={t("profile")}
      progressLabel={t("progress")}
      logoutLabel={t("logout")}
      onSignOut={onSignOut}
      avatar={
        image ? (
          <Image
            src={image}
            alt={t("avatarAlt", { name })}
            width={24}
            height={24}
            className="h-6 w-6 object-cover"
            unoptimized
          />
        ) : undefined
      }
      renderLink={({ href, onClick, className, children }) => (
        <Link href={href} onClick={onClick} className={className}>
          {children}
        </Link>
      )}
    />
  );
}
