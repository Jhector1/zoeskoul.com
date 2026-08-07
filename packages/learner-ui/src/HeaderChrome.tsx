import type { ReactNode } from "react";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type HeaderChromeProps = {
  elevated?: boolean;
  brandGroup: ReactNode;
  centerSlot?: ReactNode;
  topRowActions: ReactNode;
  mobileMenu?: ReactNode;
};

/**
 * Framework-neutral learner application header layout.
 *
 * App adapters own authentication, routing, translations, billing,
 * logout behavior, and the concrete action components. HeaderChrome owns
 * only the shared DOM/layout contract so Web, Student, and future learner
 * surfaces do not fork the header geometry.
 */
export function HeaderChrome({
  elevated = false,
  brandGroup,
  centerSlot,
  topRowActions,
  mobileMenu,
}: HeaderChromeProps) {
  return (
    <header className="sticky top-0 z-50">
      <div
        className={cn(
          "border-b border-neutral-200/80 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-neutral-950/85",
          elevated && "shadow-sm",
        )}
      >
        <div className="mx-auto px-4 md:px-6">
          <div className="flex h-16 min-w-0 items-center gap-2 sm:gap-3 lg:gap-4">
            {brandGroup}

            {centerSlot ? (
              <div className="hidden min-w-0 flex-1 justify-center xl:flex">
                <div className="max-w-full min-w-0 overflow-x-auto px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {centerSlot}
                </div>
              </div>
            ) : (
              <div className="hidden flex-1 xl:block" />
            )}

            <div
              data-ai-tutor-header-slot="true"
              className="shrink-0"
              aria-live="polite"
            />

            {topRowActions}
          </div>

          {centerSlot ? (
            <div className="xl:hidden -mt-1 pb-2">
              <div className="ui-surface-muted px-2 py-2">
                <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {centerSlot}
                </div>
              </div>
            </div>
          ) : null}

          {mobileMenu}
        </div>
      </div>
    </header>
  );
}
