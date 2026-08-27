import {
  Moon,
  Sun,
} from "lucide-react";
import {
  useTheme,
} from "next-themes";
import {
  useEffect,
  useState,
} from "react";
import {
  useAppPreferences,
} from "@zoeskoul/preferences/react";

const choices = [
  {
    value: "light",
    label: "Light",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    icon: Moon,
  },
] as const;

export function StudentThemeControl() {
  const {
    theme,
    setTheme,
  } = useTheme();
  const { updatePreferences } = useAppPreferences();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="h-9 w-[10.5rem] rounded-lg border border-neutral-200 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-lg border border-neutral-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
      role="radiogroup"
      aria-label="Color theme"
    >
      {choices.map((choice) => {
        const active = theme === choice.value;
        const Icon = choice.icon;

        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={
              active
                ? "inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-2 text-[11px] font-semibold text-white dark:bg-white dark:text-neutral-900"
                : "inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 dark:text-white/65 dark:hover:bg-white/[0.08]"
            }
            onClick={() => {
              setTheme(choice.value);
              void updatePreferences({
                theme: choice.value,
              }).catch(() => undefined);
            }}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
