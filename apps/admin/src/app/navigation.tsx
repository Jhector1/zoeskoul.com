import type {
  AnchorHTMLAttributes,
  MouseEvent,
  ReactNode,
} from "react";

export function navigateAdmin(
  href: string,
  options: { replace?: boolean } = {},
) {
  const target = new URL(href, window.location.origin);
  const method = options.replace ? "replaceState" : "pushState";

  window.history[method]({}, "", `${target.pathname}${target.search}${target.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "auto" });
}

export function AdminLink(
  props: Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    "href" | "onClick"
  > & {
    href: string;
    children: ReactNode;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  },
) {
  const { href, children, onClick, ...rest } = props;

  return (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        navigateAdmin(href);
      }}
    >
      {children}
    </a>
  );
}
