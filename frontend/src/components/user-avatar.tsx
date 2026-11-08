import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

type UserAvatarProps = { user: User | null; className?: string };

export function UserAvatar({ user, className }: UserAvatarProps) {
  const letters = initials(user);

  return (
    <Avatar className={className}>
      {user?.picture && (
        // Google's image host can refuse requests with a referrer
        <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />
      )}
      <AvatarFallback className="text-xs font-medium">
        {letters ?? <UserRound className="size-4" />}
      </AvatarFallback>
    </Avatar>
  );
}
