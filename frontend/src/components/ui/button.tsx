import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ComponentType,
  type CSSProperties,
  type ReactElement,
} from "react";
import { cn } from "cn";
import {
  Button as KumoButton,
  buttonVariants,
} from "@cloudflare/kumo/components/button";

// Kumo's types want a label on icon-only buttons, which callers give as aria-label
const Kumo = KumoButton as ComponentType<
  ComponentProps<"button"> & Parameters<typeof buttonVariants>[0]
>;

const variants = {
  default: "primary",
  destructive: "destructive",
  outline: "secondary",
  ghost: "ghost",
} as const;

const sizes = {
  default: { size: "base", shape: "base" },
  sm: { size: "sm", shape: "base" },
  icon: { size: "base", shape: "square" },
  "icon-xs": { size: "sm", shape: "square" },
  "icon-sm": { size: "sm", shape: "square" },
} as const;

type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
};

// Kumo's filled buttons draw a gradient between these, so one colour keeps them flat
const fills: Record<string, string> = {
  primary: "var(--color-kumo-contrast)",
  destructive: "var(--color-kumo-danger)",
};

function flat(variant: string): CSSProperties | undefined {
  const fill = fills[variant];
  if (!fill) return undefined;
  return {
    "--kumo-button-emphasis-bg": fill,
    "--kumo-button-emphasis-gradient-start": fill,
    "--kumo-button-emphasis-gradient-end": fill,
    "--kumo-button-emphasis-ring": fill,
  } as CSSProperties;
}

function Button({
  variant = "default",
  size = "default",
  asChild = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const kumo = { variant: variants[variant], ...sizes[size] };
  // Kumo leaves icons at their own size
  const classes = cn(
    "justify-center [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    fills[kumo.variant] && "not-disabled:hover:opacity-90",
    variant === "default" && "!text-kumo-inverse",
    // Others are ringed, which makes them a pixel bigger all round
    variant === "ghost" &&
      "not-disabled:hover:ring-1 not-disabled:hover:ring-kumo-tint",
    className,
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{
      className?: string;
      style?: CSSProperties;
    }>;
    return cloneElement(child, {
      ...props,
      className: cn(buttonVariants(kumo), classes, child.props.className),
      style: { ...flat(kumo.variant), ...child.props.style },
    });
  }
  return (
    <Kumo
      {...kumo}
      className={classes}
      {...props}
      style={{ ...flat(kumo.variant), ...props.style }}
    >
      {children}
    </Kumo>
  );
}

export { Button };
