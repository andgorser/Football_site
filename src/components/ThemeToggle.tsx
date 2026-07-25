"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "msu-football-theme";

/**
 * Переключатель темы. Значение хранится в localStorage, а до первой отрисовки
 * его применяет маленький скрипт в <head> (см. layout.tsx) — иначе страница
 * успевала бы моргнуть светлой темой.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored) setTheme(stored);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
  }

  function cycle() {
    apply(theme === "system" ? "light" : theme === "light" ? "dark" : "system");
  }

  const icon = theme === "light" ? "☀" : theme === "dark" ? "☾" : "◐";
  const title =
    theme === "light" ? "Светлая тема" : theme === "dark" ? "Тёмная тема" : "Как в системе";

  return (
    <button
      type="button"
      onClick={cycle}
      title={title}
      aria-label={`Тема оформления: ${title}. Нажмите, чтобы сменить`}
      className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <span aria-hidden suppressHydrationWarning>
        {mounted ? icon : "◐"}
      </span>
    </button>
  );
}
