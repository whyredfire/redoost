import type { User } from "@redoost/shared";
import { Show } from "solid-js";

import { UserRound } from "@/components/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const initials = (user: User | null) => {
  const words = user?.name?.trim().split(/\s+/u) ?? [];

  if (words.length > 0) {
    const ends = words.length > 1 ? [words[0], words.at(-1)] : words;

    return ends
      .map((word) => word?.[0] ?? "")
      .join("")
      .toUpperCase();
  }

  return user?.email?.[0]?.toUpperCase() ?? null;
};

interface UserAvatarProps {
  user: User | null;
  class?: string;
}

export const UserAvatar = (props: UserAvatarProps) => {
  const letters = () => initials(props.user);

  return (
    <Avatar class={props.class}>
      <Show when={props.user?.picture}>
        {(picture) => (
          <AvatarImage src={picture()} alt="" referrerpolicy="no-referrer" />
        )}
      </Show>
      <AvatarFallback class="text-xs font-medium">
        {letters() ?? <UserRound class="size-4" />}
      </AvatarFallback>
    </Avatar>
  );
};
