import { cn } from "cn"
import * as DropdownMenuPrimitive from "@kobalte/core/dropdown-menu"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { omit } from "solid-js"
import type { ComponentProps, ValidComponent } from "@solidjs/web"

import { CheckIcon, ChevronRightIcon, CircleIcon } from "@/components/icons"

// Radix's sideOffset is Kobalte's gutter, set on the root
function DropdownMenu(props: DropdownMenuPrimitive.DropdownMenuRootProps) {
  return <DropdownMenuPrimitive.Root gutter={4} {...props} />
}

function DropdownMenuPortal(props: DropdownMenuPrimitive.DropdownMenuPortalProps) {
  return <DropdownMenuPrimitive.Portal {...props} />
}

function DropdownMenuTrigger<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, DropdownMenuPrimitive.DropdownMenuTriggerProps<T>>
) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent(
  props: PolymorphicProps<
    "div",
    DropdownMenuPrimitive.DropdownMenuContentProps<"div">
  >
) {
  const others = omit(props, "class")
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        class={cn(
          // Kobalte doesn't expose the side, so this slides in as from below the trigger
          "z-50 max-h-(--kb-popper-content-available-height) min-w-[8rem] origin-(--kb-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-menu bg-popover p-1 text-popover-foreground shadow-float slide-in-from-top-2 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95",
          props.class
        )}
        {...others}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup(
  props: PolymorphicProps<"div", DropdownMenuPrimitive.DropdownMenuGroupProps<"div">>
) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem<T extends ValidComponent = "div">(
  props: PolymorphicProps<T, DropdownMenuPrimitive.DropdownMenuItemProps<T>> & {
    class?: string
    inset?: boolean
    variant?: "default" | "destructive"
  }
) {
  const others = omit(props, "class", "inset", "variant")
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={props.inset ? "" : undefined}
      data-variant={props.variant ?? "default"}
      class={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!",
        props.class
      )}
      {...(others as PolymorphicProps<
        T,
        DropdownMenuPrimitive.DropdownMenuItemProps<T>
      >)}
    />
  )
}

function DropdownMenuCheckboxItem(
  props: PolymorphicProps<
    "div",
    DropdownMenuPrimitive.DropdownMenuCheckboxItemProps<"div">
  >
) {
  const others = omit(props, "class", "children")
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      class={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...others}
    >
      <span class="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon class="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {props.children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup(
  props: PolymorphicProps<
    "div",
    DropdownMenuPrimitive.DropdownMenuRadioGroupProps<"div">
  >
) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem(
  props: PolymorphicProps<
    "div",
    DropdownMenuPrimitive.DropdownMenuRadioItemProps<"div">
  >
) {
  const others = omit(props, "class", "children")
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      class={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...others}
    >
      <span class="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon class="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {props.children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

// A plain element: Kobalte's GroupLabel only works inside a Group
function DropdownMenuLabel(
  props: ComponentProps<"div"> & {
    inset?: boolean
  }
) {
  const others = omit(props, "class", "inset")
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={props.inset ? "" : undefined}
      class={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        props.class
      )}
      {...others}
    />
  )
}

function DropdownMenuSeparator(
  props: PolymorphicProps<
    "div",
    DropdownMenuPrimitive.DropdownMenuSeparatorProps<"div">
  >
) {
  const others = omit(props, "class")
  return (
    <DropdownMenuPrimitive.Separator
      // A div, since an hr brings its own border
      as="div"
      data-slot="dropdown-menu-separator"
      class={cn("-mx-1 my-1 h-px bg-border", props.class)}
      {...others}
    />
  )
}

function DropdownMenuShortcut(props: ComponentProps<"span">) {
  const others = omit(props, "class")
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      class={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        props.class
      )}
      {...others}
    />
  )
}

const DropdownMenuSub = DropdownMenuPrimitive.Sub

function DropdownMenuSubTrigger(
  props: PolymorphicProps<
    "div",
    DropdownMenuPrimitive.DropdownMenuSubTriggerProps<"div">
  > & {
    inset?: boolean
  }
) {
  const others = omit(props, "class", "inset", "children")
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={props.inset ? "" : undefined}
      class={cn(
        "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[inset]:pl-8 data-[expanded]:bg-accent data-[expanded]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        props.class
      )}
      {...others}
    >
      {props.children}
      <ChevronRightIcon class="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent(
  props: PolymorphicProps<
    "div",
    DropdownMenuPrimitive.DropdownMenuSubContentProps<"div">
  >
) {
  const others = omit(props, "class")
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        class={cn(
          "z-50 min-w-[8rem] origin-(--kb-menu-content-transform-origin) overflow-hidden rounded-menu bg-popover p-1 text-popover-foreground shadow-float data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95",
          props.class
        )}
        {...others}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
