type Props = {
  className: string;
  courseTitle: string;
  backHref: string;
  createAssignmentHref: string;
};

export default function ClassCourseWorkspaceBar(
  props: Props,
) {
  return (
    <div className="flex min-h-12 w-full items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2 dark:border-white/10 dark:bg-neutral-950">
      <a
        href={props.backHref}
        className="ui-btn ui-btn-secondary shrink-0"
      >
        ← Back to class
      </a>

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
          {props.className}
        </div>
        <div className="truncate text-xs text-neutral-500 dark:text-white/55">
          {props.courseTitle}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="ui-badge-neutral">
          Teacher workspace
        </span>
        <a
          href={props.createAssignmentHref}
          className="ui-btn ui-btn-primary"
        >
          Create assignment
        </a>
      </div>
    </div>
  );
}
