import type { ComponentProps } from "react";
import { cn } from "cn";
import { LayerCard } from "@cloudflare/kumo/components/layer-card";

function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <LayerCard
      className={cn("flex flex-col gap-6 rounded-xl py-6", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-6", className)} {...props} />;
}

export { Card, CardContent };
