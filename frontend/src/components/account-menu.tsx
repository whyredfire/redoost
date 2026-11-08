import { Link } from "@tanstack/react-router";
import { LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { UserAvatar } from "@/components/user-avatar";
import type { User } from "@/lib/auth";

type AccountMenuProps = {
  user: User | null;
  onSignOut: () => void;
};

export function AccountMenu({ user, onSignOut }: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Your account"
        >
          <UserAvatar user={user} className="size-7" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" className="w-60">
        {user && (
          <>
            <div className="px-2 py-1.5">
              {user.name && (
                <p className="truncate text-sm font-medium">{user.name}</p>
              )}
              {user.email && (
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              )}
            </div>
            <DropdownMenu.Separator />
          </>
        )}
        <DropdownMenu.LinkItem icon={Settings} render={<Link to="/settings" />}>
          Settings
        </DropdownMenu.LinkItem>
        <DropdownMenu.Item icon={LogOut} onClick={onSignOut}>
          Sign out
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
