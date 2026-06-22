"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function ThemeToggle({ inline = false }: { inline?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const path = usePathname();
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const label = theme === "dark" ? "☀️" : "🌙";
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  if (inline) {
    return (
      <button onClick={toggle}
        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm transition"
        title="Toggle theme">
        {label}
      </button>
    );
  }

  // Hide floating button on pages that have their own navbar with toggle
  // or on landing page which has Sign In button in top right
  const hideFloating = path === "/" || path.startsWith("/user") || 
                       path.startsWith("/admin") || path.startsWith("/marketplace") || 
                       path === "/simulator";
  if (hideFloating) return null;

  return (
    <button onClick={toggle}
      className="fixed top-4 right-4 z-[9999] w-10 h-10 rounded-full bg-foreground/20 backdrop-blur border border-border/40 flex items-center justify-center text-lg hover:opacity-80 transition-opacity shadow-lg"
      title="Toggle theme">
      {label}
    </button>
  );
}
