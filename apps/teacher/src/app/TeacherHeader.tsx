import {
  HeaderChrome,
} from "@zoeskoul/learner-ui";

import {
  useTranslations,
} from "../compat/next-intl";
import {
  TeacherLink,
} from "./TeacherLink";

export type TeacherHeaderSection =
  | "home"
  | "classes"
  | "tutoring"
  | "institution";

type NavItem = {
  section: TeacherHeaderSection;
  href: string;
  key:
    | "home"
    | "classes"
    | "tutoring"
    | "institution";
};

const NAV_ITEMS: readonly NavItem[] = [
  {
    section: "home",
    href: "/",
    key: "home",
  },
  {
    section: "classes",
    href: "/classes",
    key: "classes",
  },
  {
    section: "tutoring",
    href: "/tutoring",
    key: "tutoring",
  },
  {
    section: "institution",
    href: "/institution",
    key: "institution",
  },
];

function desktopItem(active: boolean) {
  return [
    active
      ? "ui-btn-ide-active"
      : "ui-btn-ide-ghost",
    "h-8 whitespace-nowrap",
  ].join(" ");
}

function mobileItem(active: boolean) {
  return [
    "inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors",
    active
      ? "bg-[rgb(var(--ui-text)/1)] text-[rgb(var(--ui-text-invert)/1)]"
      : "text-[rgb(var(--ui-text-muted)/0.9)] hover:bg-[rgb(var(--ui-hover)/0.72)] hover:text-[rgb(var(--ui-text)/1)]",
  ].join(" ");
}

export function TeacherHeader(props: {
  locale: string;
  websiteOrigin: string;
  activeSection: TeacherHeaderSection;
}) {
  const t = useTranslations("Teacher.header");

  const nav = NAV_ITEMS.map((item) => {
    const active = item.section === props.activeSection;

    return (
      <TeacherLink
        key={item.section}
        href={item.href}
        locale={props.locale}
        className={desktopItem(active)}
        aria-current={active ? "page" : undefined}
      >
        {t(`nav.${item.key}`)}
      </TeacherLink>
    );
  });

  const mobileNav = NAV_ITEMS.map((item) => {
    const active = item.section === props.activeSection;

    return (
      <TeacherLink
        key={item.section}
        href={item.href}
        locale={props.locale}
        className={mobileItem(active)}
        aria-current={active ? "page" : undefined}
      >
        {t(`nav.${item.key}`)}
      </TeacherLink>
    );
  });

  const brandGroup = (
    <TeacherLink
      href="/"
      locale={props.locale}
      className="group flex min-w-0 shrink-0 items-center gap-2.5"
    >
      <div className="ui-icon-box h-9 w-9 rounded-lg">
        <span className="text-sm font-semibold text-[rgb(var(--ui-text)/0.94)]">
          Z
        </span>
      </div>

      <div className="min-w-0 leading-tight">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-[rgb(var(--ui-text)/0.94)]">
            ZoeSkoul
          </span>
          <span className="hidden ui-pill-neutral sm:inline-flex">
            {t("badge")}
          </span>
        </div>

        <div className="hidden truncate text-[11px] text-[rgb(var(--ui-text-muted)/0.82)] sm:block">
          {t("tagline")}
        </div>
      </div>
    </TeacherLink>
  );

  const centerSlot = (
    <nav
      aria-label={t("navLabel")}
      className="ui-surface-soft flex items-center gap-1 rounded-lg p-1"
    >
      {nav}
    </nav>
  );

  const topRowActions = (
    <a
      href={props.websiteOrigin}
      className="ui-btn-secondary h-8 whitespace-nowrap"
    >
      {t("mainSite")}
    </a>
  );

  const mobileMenu = (
    <div className="border-t ui-border-soft px-4 py-2 xl:hidden">
      <nav
        aria-label={t("navLabel")}
        className="flex min-w-0 gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {mobileNav}
      </nav>
    </div>
  );

  return (
    <HeaderChrome
      brandGroup={brandGroup}
      centerSlot={centerSlot}
      topRowActions={topRowActions}
      mobileMenu={mobileMenu}
    />
  );
}
