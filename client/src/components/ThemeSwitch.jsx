import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/useTheme";

export default function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-label="Dark theme"
      aria-checked={dark}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
      className="flex min-h-10 shrink-0 items-center gap-2 rounded-md border border-ink-200 bg-surface px-2.5 text-ink-700 hover:border-ink-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500"
    >
      {dark ? <Moon size={16} className="hidden sm:block" aria-hidden="true" /> : <Sun size={16} className="hidden sm:block" aria-hidden="true" />}
      <span aria-hidden="true" className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 ${dark ? "bg-brass-500" : "bg-ink-300"}`}>
        <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${dark ? "translate-x-4" : "translate-x-0"}`} />
      </span>
    </button>
  );
}
