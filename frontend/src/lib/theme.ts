import { createSignal } from "solid-js";

export type Theme = "system" | "light" | "dark";

// Same key and values as the script in index.html that applies it before first paint
const themeKey = "theme";
const systemDark = matchMedia("(prefers-color-scheme: dark)");

function loadTheme(): Theme {
  const saved = localStorage.getItem(themeKey);
  return saved === "light" || saved === "dark" ? saved : "system";
}

function isDark(theme: Theme, system: boolean) {
  return theme === "dark" || (theme === "system" && system);
}

function apply() {
  const dark = isDark(loadTheme(), systemDark.matches);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0a0a0a" : "#fafafa");
  setStoredTheme(loadTheme());
  setSystem(systemDark.matches);
}

const [theme, setStoredTheme] = createSignal(loadTheme());
const [system, setSystem] = createSignal(systemDark.matches);

systemDark.addEventListener("change", apply);

export function setTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem(themeKey);
  else localStorage.setItem(themeKey, theme);
  apply();
}

export function useTheme() {
  return { theme, dark: () => isDark(theme(), system()) };
}
