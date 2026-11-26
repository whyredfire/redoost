import { createSignal } from "solid-js";

export type Theme = "system" | "light" | "dark";

// WARNING: index.html's pre-paint script reads this same key and values, so change both together
const themeKey = "theme";
const systemDark = matchMedia("(prefers-color-scheme: dark)");

const loadTheme = () => {
  const saved = localStorage.getItem(themeKey);

  return saved === "light" || saved === "dark" ? saved : "system";
};

const isDark = (theme: Theme, system: boolean) =>
  theme === "dark" || (theme === "system" && system);

const [theme, setStoredTheme] = createSignal<Theme>(loadTheme());
const [system, setSystem] = createSignal(systemDark.matches);

const apply = () => {
  const dark = isDark(loadTheme(), systemDark.matches);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0a0a0a" : "#fafafa");
  setStoredTheme(loadTheme());
  setSystem(systemDark.matches);
};

systemDark.addEventListener("change", apply);

export const setTheme = (next: Theme) => {
  if (next === "system") {
    localStorage.removeItem(themeKey);
  } else {
    localStorage.setItem(themeKey, next);
  }

  apply();
};

export const useTheme = () => ({
  theme,
  dark: () => isDark(theme(), system()),
});
