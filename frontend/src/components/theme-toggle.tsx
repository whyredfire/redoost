import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTheme, useTheme } from "@/lib/theme";

// Flips to the other theme; settings can go back to following the system
export function ThemeToggle() {
  const { dark } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
