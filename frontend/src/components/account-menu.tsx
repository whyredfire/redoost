import { LogOut, Settings, UserRound } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsDialog } from "@/components/settings-dialog";
import type { User } from "@/lib/auth";

function initials(user: User | null) {
  const words = user?.name?.trim().split(/\s+/) ?? [];
  if (words.length > 0) {
    return words.length > 1
      ? `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase()
      : words[0]![0]!.toUpperCase();
  }
  return user?.email?.[0]?.toUpperCase() ?? null;
}

type AccountMenuProps = {
  user: User | null;
  onSignOut: () => void;
  onDelete: () => Promise<void>;
};

export function AccountMenu({ user, onSignOut, onDelete }: AccountMenuProps) {
  const letters = initials(user);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Your account"
          >
            <Avatar className="size-7">
              <AvatarFallback className="text-xs font-medium">
                {letters ?? <UserRound className="size-4" />}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {user && (
            <>
              <DropdownMenuLabel className="font-normal">
                {user.name && (
                  <p className="truncate text-sm font-medium">{user.name}</p>
                )}
                {user.email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            <Settings />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsDialog
        user={user}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onDelete={onDelete}
      />
    </>
  );
}
