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
  | "tutoring"
  | "classes"
  | "assignments"
  | "reports"
  | "school";

type NavItem = {
  section: TeacherHeaderSection;
  href: string;
  key:
    | "tutoring"
    | "classes"
    | "assignments"
    | "reports"
    | "school";
};

const NAV_ITEMS: readonly NavItem[] = [
  {
    section: "tutoring",
    href: "/",
    key: "tutoring",
  },
  {
    section: "classes",
    href: "/classes",
    key: "classes",
  },
  {
    section: "assignments",
    href: "/assignments",
    key: "assignments",
  },
  {
    section: "reports",
    href: "/reports",
    key: "reports",
  },
  {
    section: "school",
    href: "/school",
    key: "school",
  },
];

function desktopItem(
  active: boolean,
) {
  return [
    active
      ? "ui-btn-ide-active"
      : "ui-btn-ide-ghost",
    "h-8 whitespace-nowrap",
  ].join(" ");
}

function mobileItem(
  active: boolean,
) {
  return [
    "inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors",
    active
      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
      : "text-neutral-700 hover:bg-neutral-100 dark:text-white/75 dark:hover:bg-white/[0.08]",
  ].join(" ");
}

export function TeacherHeader(
  props: {
    locale: string;
    websiteOrigin: string;
    activeSection:
      TeacherHeaderSection;
  },
) {
  const t =
    useTranslations(
      "Teacher.header",
    );

  const nav = NAV_ITEMS.map(
    (item) => {
      const active =
        item.section ===
        props.activeSection;

      return (
        <TeacherLink
          key={item.section}
          href={item.href}
          locale={props.locale}
          className={desktopItem(
            active,
          )}
          aria-current={
            active
              ? "page"
              : undefined
          }
        >
          {t(`nav.${item.key}`)}
        </TeacherLink>
      );
    },
  );

  const mobileNav =
    NAV_ITEMS.map((item) => {
      const active =
        item.section ===
        props.activeSection;

      return (
        <TeacherLink
          key={item.section}
          href={item.href}
          locale={props.locale}
          className={mobileItem(
            active,
          )}
          aria-current={
            active
              ? "page"
              : undefined
          }
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
        <span className="text-sm font-semibold text-neutral-900 dark:text-white/90">
          Z
        </span>
      </div>

      <div className="min-w-0 leading-tight">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-neutral-900 dark:text-white/90">
            ZoeSkoul
          </span>
          <span className="hidden ui-pill-neutral sm:inline-flex">
            {t("badge")}
          </span>
        </div>

        <div className="hidden truncate text-[11px] text-neutral-500 dark:text-white/55 sm:block">
          {t("tagline")}
        </div>
      </div>
    </TeacherLink>
  );

  const centerSlot = (
    <nav
      aria-label={t("navLabel")}
      className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.04]"
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
    <div className="border-t border-neutral-200/80 px-4 py-2 xl:hidden dark:border-white/10">
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
      elevated
      brandGroup={brandGroup}
      centerSlot={centerSlot}
      topRowActions={
        topRowActions
      }
      mobileMenu={mobileMenu}
    />
  );
}
