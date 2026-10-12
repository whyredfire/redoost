import { cn } from "cn";
import claude from "@/assets/agents/claude.svg";
import codex from "@/assets/agents/codex.png";
import cursor from "@/assets/agents/cursor.svg";
import opencodeDark from "@/assets/agents/opencode-dark.svg";
import opencodeLight from "@/assets/agents/opencode-light.svg";

// Agents the redoost skill installs for, with each one's official logo
const agents = [
  { name: "Claude", logo: claude },
  { name: "Codex", logo: codex },
  { name: "Cursor", logo: cursor },
  { name: "OpenCode", logo: opencodeLight, dark: opencodeDark },
];

export function AgentLogos({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5", className)} aria-hidden>
      {agents.map(({ name, logo, dark }) => (
        <span key={name} className="contents">
          <img
            src={logo}
            alt=""
            title={name}
            className={cn("h-3.5 w-auto", dark && "dark:hidden")}
          />
          {dark && (
            <img
              src={dark}
              alt=""
              title={name}
              className="hidden h-3.5 w-auto dark:block"
            />
          )}
        </span>
      ))}
    </span>
  );
}
