type ProjectTopbarIconProps = {
  className?: string;
};

function iconStyle() {
  return {
    width: 11,
    height: 11,
    flex: "0 0 auto",
    display: "block",
  } as const;
}

export function ProjectPreviewIcon(
  props: ProjectTopbarIconProps,
) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={props.className}
      width="11"
      height="11"
      style={iconStyle()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="13" rx="2.5" />
      <path d="m10.2 9 4.8 2.5-4.8 2.5V9Z" />
      <path d="M9 21h6" />
    </svg>
  );
}

export function ProjectCodeIcon(
  props: ProjectTopbarIconProps,
) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={props.className}
      width="11"
      height="11"
      style={iconStyle()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m8.25 7-5 5 5 5" />
      <path d="m15.75 7 5 5-5 5" />
      <path d="m13.25 4.5-2.5 15" />
    </svg>
  );
}

export function ProjectPublishIcon(
  props: ProjectTopbarIconProps,
) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={props.className}
      width="11"
      height="11"
      style={iconStyle()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 14V4" />
      <path d="m8.5 7.5 3.5-3.5 3.5 3.5" />
      <path d="M5 12.5v5.25A2.25 2.25 0 0 0 7.25 20h9.5A2.25 2.25 0 0 0 19 17.75V12.5" />
    </svg>
  );
}
