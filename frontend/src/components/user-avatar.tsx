import { Show } from "solid-js";
import { UserRound } from "@/components/icons";
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

type UserAvatarProps = { user: User | null; class?: string };

export function UserAvatar(props: UserAvatarProps) {
  const letters = () => initials(props.user);

  return (
    <Avatar class={props.class}>
      <Show when={props.user?.picture}>
        {/* Google's image host can refuse requests with a referrer */}
        {(picture) => (
          <AvatarImage src={picture()} alt="" referrerpolicy="no-referrer" />
        )}
      </Show>
      <AvatarFallback class="text-xs font-medium">
        {letters() ?? <UserRound class="size-4" />}
      </AvatarFallback>
    </Avatar>
  );
}
