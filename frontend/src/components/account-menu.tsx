import { LogOut, Trash2, UserRound } from "lucide-react";
import { useState, type MouseEvent } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function closeDialog(open: boolean) {
    if (open || deleting) return;
    setConfirming(false);
    setError("");
  }

  async function confirmDelete(event: MouseEvent) {
    // Keep the dialog open until the request finishes
    event.preventDefault();
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setDeleting(false);
    }
  }

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
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirming(true)}
          >
            <Trash2 />
            Delete account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirming} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account and all your sites are deleted, and the sites go
              offline right away. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
