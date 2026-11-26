import { defaultLimits, formatBytes } from "@redoost/shared";
import type { Limits } from "@redoost/shared";
import type { JSX } from "@solidjs/web";
import { For } from "solid-js";

import {
  Bot,
  CalendarClock,
  ChevronDown,
  History,
  KeyRound,
  Pencil,
  Power,
  Route,
  Server,
} from "@/components/icons";
import type { LucideIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { inset } from "@/lib/layout";

const SectionHeading = (props: { title: string; children?: JSX.Element }) => (
  <div class={cn(inset, "space-y-3 border-t pt-14 pb-10")}>
    <h2 class="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
      {props.title}
    </h2>
    {props.children && (
      <p class="text-muted-foreground max-w-xl text-balance">
        {props.children}
      </p>
    )}
  </div>
);

const grid = "grid gap-px";

const pad = "px-5 sm:px-8 lg:px-12";

const cell = cn(
  pad,
  "bg-card hover:bg-muted group/cell py-8 transition-colors duration-200"
);

const benefits = [
  {
    amount: "1",
    unit: "drop",
    label: "and the site is live at its own address",
  },
  { amount: "0", unit: "config", label: "no build step, nothing to set up" },
  {
    amount: "32",
    unit: "at once",
    label: "parallel uploads that resume if interrupted",
  },
  {
    amount: "100%",
    unit: "open source",
    label: "MIT licensed, and yours to host",
  },
];

export const Benefits = () => (
  <section
    aria-label="Benefits"
    class="bg-background grid grid-cols-2 gap-px md:grid-cols-4"
  >
    <For each={benefits}>
      {(benefit) => (
        <div class={cn(pad, "bg-card space-y-2 py-8")}>
          <p class="font-mono text-3xl tracking-tight sm:text-4xl">
            {benefit.amount}
            <span class="text-muted-foreground ml-1.5 text-base sm:text-lg">
              {benefit.unit}
            </span>
          </p>
          <p class="text-muted-foreground text-sm text-balance">
            {benefit.label}
          </p>
        </div>
      )}
    </For>
  </section>
);

const steps = [
  {
    title: "Drop a folder",
    text: "A built site, a zip, or one HTML file. The limits are checked before anything uploads.",
  },
  {
    title: "It goes straight to storage",
    text: "Your browser uploads every file directly, checksummed, up to 32 at a time. If it's interrupted, pick the folder again to resume.",
  },
  {
    title: "It's live at its own address",
    text: "Each site gets a subdomain like brave-otter-1a2b and stays online until you take it down.",
  },
];

export const HowItWorks = () => (
  <section>
    <SectionHeading title="How it works" />
    <ol class={cn(grid, "md:grid-cols-3")}>
      <For each={steps}>
        {(step, index) => (
          <li class={cn(cell, "space-y-2")}>
            <p class="text-brand font-mono text-sm">0{index() + 1}</p>
            <h3 class="font-medium">{step.title}</h3>
            <p class="text-muted-foreground text-sm">{step.text}</p>
          </li>
        )}
      </For>
    </ol>
  </section>
);

const features: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Route,
    title: "Single-page apps just work",
    text: "Unknown paths serve index.html. Add a 404.html and it becomes the site's 404 page instead.",
  },
  {
    icon: History,
    title: "Versions and rollback",
    text: "Update a site with a new version, and go back to an earlier one in a click.",
  },
  {
    icon: CalendarClock,
    title: "Expiry dates",
    text: "Have a site go offline on a set date, or keep it up for good.",
  },
  {
    icon: Power,
    title: "Offline, not deleted",
    text: "Take a site offline and bring it back later, files and address intact.",
  },
  {
    icon: Pencil,
    title: "Descriptions",
    text: "Note what each site is for, so a list of generated names stays readable.",
  },
  {
    icon: KeyRound,
    title: "Tokens for CI",
    text: "Create API tokens that can only read, publish, or manage, for scripts and pipelines.",
  },
  {
    icon: Bot,
    title: "Works with your agent",
    text: "One prompt sets up Claude Code, Codex, Cursor, or OpenCode to publish for you.",
  },
  {
    icon: Server,
    title: "Yours to run",
    text: "Open source under MIT, with container images and a Helm chart to host it yourself.",
  },
];

export const Features = () => (
  <section>
    <SectionHeading title="Everything a quick site needs">
      Publishing is one step, and the rest is there when you need it.
    </SectionHeading>
    <ul class={cn(grid, "sm:grid-cols-2 lg:grid-cols-4")}>
      <For each={features}>
        {(feature) => {
          const Icon = feature.icon;

          return (
            <li class={cn(cell, "space-y-2")}>
              <Icon class="text-muted-foreground group-hover/cell:text-brand mb-4 size-5 transition-[color,translate] duration-200 group-hover/cell:-translate-y-0.5" />
              <h3 class="font-medium">{feature.title}</h3>
              <p class="text-muted-foreground text-sm">{feature.text}</p>
            </li>
          );
        }}
      </For>
    </ul>
  </section>
);

const questions = (limits: Limits) => [
  {
    question: "Where are my files stored?",
    answer:
      "In S3-compatible storage. Your browser uploads each file directly with its own signed, checksummed request, so the API never handles file contents.",
  },
  {
    question: "How big can a site be?",
    answer: `Files can be up to ${formatBytes(limits.max_file_size)}, and a site up to ${formatBytes(limits.max_deployment_size)} and ${limits.max_deployment_files.toLocaleString("en")} files. Text files are gzipped in your browser first, and the limits are checked as soon as you pick the files.`,
  },
  {
    question: "How long do sites stay online?",
    answer:
      "Until you take them offline or delete them, unless you give them an expiry date.",
  },
  {
    question: "Do I need a build step or any config?",
    answer:
      "No. Upload what you'd serve, like an index.html and its files. redoost doesn't build anything.",
  },
  {
    question: "Can I run my own redoost?",
    answer:
      "Yes. It's open source under the MIT license, with container images and a Helm chart.",
  },
];

export const Faq = (props: { limits: Limits | null }) => (
  <section class="pb-16">
    <SectionHeading title="Frequently Asked Questions" />
    <div class={cn(grid, "grid-cols-1")}>
      <For each={questions(props.limits ?? defaultLimits)}>
        {(item) => (
          <details class="bg-card hover:bg-muted group transition-colors duration-200">
            <summary
              class={cn(
                pad,
                "flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden"
              )}
            >
              {item.question}
              <ChevronDown class="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <p class={cn(pad, "text-muted-foreground max-w-3xl pb-5 text-sm")}>
              {item.answer}
            </p>
          </details>
        )}
      </For>
    </div>
  </section>
);
