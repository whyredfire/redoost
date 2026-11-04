import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";

// Same key and values as the script in index.html that applies it before first paint
const themeKey = "theme";
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function loadTheme(): Theme {
  const saved = localStorage.getItem(themeKey);
  return saved === "light" || saved === "dark" ? saved : "system";
}

function isDark(theme: Theme) {
  return theme === "dark" || (theme === "system" && systemDark.matches);
}

function apply() {
  const dark = isDark(loadTheme());
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0a0a0a" : "#ffffff");
  for (const listener of listeners) listener();
}

// Following the system means following it as it changes, too
systemDark.addEventListener("change", apply);

export function setTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem(themeKey);
  else localStorage.setItem(themeKey, theme);
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function systemIsDark() {
  return systemDark.matches;
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, loadTheme);
  // Its own snapshot, so the system switching re-renders while following it
  const system = useSyncExternalStore(subscribe, systemIsDark);
  return { theme, dark: theme === "dark" || (theme === "system" && system) };
}
