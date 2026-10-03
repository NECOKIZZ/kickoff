"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun, X } from "lucide-react";
import { Logo } from "@/ui/Logo";
import { useDarkMode } from "@/ui/ThemeToggle";

/**
 * Phone navigation: a menu button that slides in a left drawer holding the
 * app tabs and the light/dark switch, so the top bar keeps only the guide,
 * balance and wallet. Hidden from sm up, where the tabs sit in the header.
 */
export function MobileNav({ tabs }: { tabs: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation.
  useEffect(() => setOpen(false), [pathname]);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="sm:hidden flex items-center justify-center shrink-0 cursor-pointer size-8 -ml-1"
        style={{ background: "none", border: "none", color: "var(--foreground)" }}
      >
        <Menu size={20} />
      </button>
      {open && <Drawer tabs={tabs} pathname={pathname} onClose={close} />}
    </>
  );
}

function Drawer({
  tabs,
  pathname,
  onClose,
}: {
  tabs: { label: string; href: string }[];
  pathname: string;
  onClose: () => void;
}) {
  // Mounted only while open, so it reads the current theme fresh each time.
  const [dark, toggle] = useDarkMode();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="sm:hidden fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Menu">
      <div
        onClick={onClose}
        className="absolute inset-0 transition-opacity duration-200"
        style={{ background: "rgba(0,0,0,0.45)", opacity: shown ? 1 : 0 }}
      />
      <nav
        className="absolute inset-y-0 left-0 flex flex-col transition-transform duration-200 ease-out"
        style={{
          width: "min(80vw, 300px)",
          background: "var(--background)",
          borderRight: "1px solid var(--border)",
          boxShadow: "8px 0 30px rgba(0,0,0,0.25)",
          transform: shown ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <div className="flex items-center justify-between px-4" style={{ minHeight: 58, borderBottom: "1px solid var(--border)" }}>
          <Link href="/" aria-label="Home" className="flex" onClick={onClose}>
            <Logo size={24} />
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="flex items-center justify-center size-8 cursor-pointer -mr-1"
            style={{ background: "none", border: "none", color: "var(--muted-foreground)" }}
          >
            <X size={20} />
          </button>
        </div>

        <ul className="flex flex-col py-3 px-2">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center px-3 py-3"
                  style={{
                    fontFamily: "'Clash Display', sans-serif",
                    fontSize: "1rem",
                    fontWeight: 600,
                    borderRadius: 10,
                    textDecoration: "none",
                    color: active ? "var(--foreground)" : "var(--muted-foreground)",
                    background: active ? "var(--muted)" : "transparent",
                    borderLeft: active ? "3px solid var(--primary)" : "3px solid transparent",
                  }}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto px-4 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={toggle}
            role="switch"
            aria-checked={dark}
            className="w-full flex items-center justify-between cursor-pointer px-1 py-2"
            style={{ background: "none", border: "none", color: "var(--foreground)", fontSize: "0.9rem" }}
          >
            <span className="flex items-center gap-3">
              {dark ? <Moon size={16} /> : <Sun size={16} />}
              Dark mode
            </span>
            <span
              aria-hidden
              style={{
                width: 40,
                height: 22,
                borderRadius: 99,
                padding: 2,
                background: dark ? "var(--ui-accent)" : "var(--muted)",
                border: "1px solid var(--border)",
                transition: "background 0.15s",
                display: "flex",
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 99,
                  background: dark ? "var(--ui-accent-contrast)" : "var(--foreground)",
                  transform: dark ? "translateX(18px)" : "translateX(0)",
                  transition: "transform 0.15s",
                }}
              />
            </span>
          </button>
        </div>
      </nav>
    </div>,
    document.body,
  );
}
