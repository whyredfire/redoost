import { Link } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { LogOut, Settings } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import type { User } from "@/lib/auth";

type AccountMenuProps = {
  user: User | null;
  onSignOut: () => void;
};

export function AccountMenu(props: AccountMenuProps) {
  return (
    <DropdownMenu placement="bottom-end">
      <DropdownMenuTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="rounded-full"
        aria-label="Your account"
      >
        <UserAvatar user={props.user} class="size-7" />
      </DropdownMenuTrigger>
      <DropdownMenuContent class="w-60">
        <Show when={props.user}>
          {(user) => (
            <>
              <DropdownMenuLabel class="font-normal">
                <Show when={user().name}>
                  <p class="truncate text-sm font-medium">{user().name}</p>
                </Show>
                <Show when={user().email}>
                  <p class="truncate text-xs text-muted-foreground">
                    {user().email}
                  </p>
                </Show>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
        </Show>
        <DropdownMenuItem as={Link} to="/settings">
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onSignOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
