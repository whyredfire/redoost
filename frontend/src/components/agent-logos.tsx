import { cn } from "cn";
import { For, Show } from "solid-js";

import claude from "@/assets/agents/claude.svg";
import codex from "@/assets/agents/codex.png";
import cursor from "@/assets/agents/cursor.svg";
import opencodeDark from "@/assets/agents/opencode-dark.svg";
import opencodeLight from "@/assets/agents/opencode-light.svg";

const agents: { name: string; logo: string; dark?: string }[] = [
  { name: "Claude", logo: claude },
  { name: "Codex", logo: codex },
  { name: "Cursor", logo: cursor },
  { name: "OpenCode", logo: opencodeLight, dark: opencodeDark },
];

export const AgentLogos = (props: { class?: string }) => (
  <span class={cn("flex items-center gap-1.5", props.class)} aria-hidden="true">
    <For each={agents}>
      {({ name, logo, dark }) => (
        <span class="contents">
          <img
            src={logo}
            alt=""
            title={name}
            class={cn("h-3.5 w-auto", dark && "dark:hidden")}
          />
          <Show when={dark}>
            <img
              src={dark}
              alt=""
              title={name}
              class="hidden h-3.5 w-auto dark:block"
            />
          </Show>
        </span>
      )}
    </For>
  </span>
);
