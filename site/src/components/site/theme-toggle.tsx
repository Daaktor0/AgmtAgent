"use client";

import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "agmt-color-theme";

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === "night" ? "day" : "night";
    root.dataset.theme = next;
    root.style.colorScheme = next === "night" ? "dark" : "light";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The visual switch still works when storage is unavailable.
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-switch"
      aria-label="Change colour theme"
      title="Change colour theme"
    >
      <span className="theme-day-action" aria-hidden>
        <Moon className="size-3.5" />
        Night
      </span>
      <span className="theme-night-action" aria-hidden>
        <Sun className="size-3.5" />
        Day
      </span>
    </button>
  );
}
