import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTheme, useTheme } from "@/lib/theme";

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
