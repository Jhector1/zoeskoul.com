import type {
  AnchorHTMLAttributes,
  MouseEvent,
} from "react";

import {
  localizedHref,
  navigate,
} from "../compat/navigation-runtime";

function plainPrimaryClick(
  event: MouseEvent<HTMLAnchorElement>,
) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function TeacherLink(
  props: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    locale: string;
  },
) {
  const {
    href,
    locale,
    onClick,
    target,
    ...rest
  } = props;

  const resolved =
    localizedHref(href, locale);

  return (
    <a
      {...rest}
      href={resolved}
      target={target}
      onClick={(event) => {
        onClick?.(event);

        if (
          !plainPrimaryClick(event) ||
          target === "_blank"
        ) {
          return;
        }

        event.preventDefault();
        navigate(resolved);
      }}
    />
  );
}
