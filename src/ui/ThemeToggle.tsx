"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "kickoff-theme";

export function useDarkMode() {
  const [dark, setDark] = useState(false);

  // Read persisted choice on mount (SSR-safe).
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = stored ? stored === "dark" : prefers;
    setDark(initial);
    document.documentElement.classList.toggle("dark", initial);
  }, []);

  const toggle = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      return next;
    });
  };

  return [dark, toggle] as const;
}

export function ThemeToggle() {
  const [dark, toggle] = useDarkMode();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="flex items-center justify-center shrink-0 cursor-pointer size-8 sm:size-[34px]"
      style={{
        background: "var(--muted)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        color: "var(--foreground)",
        transition: "background 0.15s",
      }}
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
