import type { JSX } from "@solidjs/web";
import { cn } from "cn";
import {
  ArrowLeft as ArrowLeftNode,
  Bot as BotNode,
  Check as CheckNode,
  ChevronDown as ChevronDownNode,
  ChevronRight as ChevronRightNode,
  ChevronUp as ChevronUpNode,
  Circle as CircleNode,
  CircleCheck as CircleCheckNode,
  Copy as CopyNode,
  ExternalLink as ExternalLinkNode,
  Globe as GlobeNode,
  HardDrive as HardDriveNode,
  History as HistoryNode,
  Info as InfoNode,
  KeyRound as KeyRoundNode,
  LogIn as LogInNode,
  LogOut as LogOutNode,
  Monitor as MonitorNode,
  Moon as MoonNode,
  Palette as PaletteNode,
  Pencil as PencilNode,
  Plus as PlusNode,
  RefreshCw as RefreshCwNode,
  Search as SearchNode,
  Settings as SettingsNode,
  Sun as SunNode,
  Trash2 as Trash2Node,
  UserRound as UserRoundNode,
  X as XNode,
  type IconNode,
} from "lucide";
import { omit } from "solid-js";

// lucide-solid doesn't run on Solid 2, so icons are drawn from lucide's own data
export type LucideIcon = (props: JSX.SvgSVGAttributes<SVGSVGElement>) => JSX.Element;

function icon(name: string, node: IconNode): LucideIcon {
  // Lucide's data is trusted static markup
  const markup = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(" ")}/>`)
    .join("");
  return (props) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={props["aria-label"] ? undefined : "true"}
      {...omit(props, "class")}
      class={cn("lucide", `lucide-${name}`, props.class as string)}
      innerHTML={markup}
    />
  );
}

export const ArrowLeft = icon("arrow-left", ArrowLeftNode);
export const Bot = icon("bot", BotNode);
export const Check = icon("check", CheckNode);
export const ChevronDown = icon("chevron-down", ChevronDownNode);
export const ChevronRight = icon("chevron-right", ChevronRightNode);
export const ChevronUp = icon("chevron-up", ChevronUpNode);
export const Circle = icon("circle", CircleNode);
export const CircleCheck = icon("circle-check", CircleCheckNode);
export const Copy = icon("copy", CopyNode);
export const ExternalLink = icon("external-link", ExternalLinkNode);
export const Globe = icon("globe", GlobeNode);
export const HardDrive = icon("hard-drive", HardDriveNode);
export const History = icon("history", HistoryNode);
export const Info = icon("info", InfoNode);
export const KeyRound = icon("key-round", KeyRoundNode);
export const LogIn = icon("log-in", LogInNode);
export const LogOut = icon("log-out", LogOutNode);
export const Monitor = icon("monitor", MonitorNode);
export const Moon = icon("moon", MoonNode);
export const Palette = icon("palette", PaletteNode);
export const Pencil = icon("pencil", PencilNode);
export const Plus = icon("plus", PlusNode);
export const RefreshCw = icon("refresh-cw", RefreshCwNode);
export const Search = icon("search", SearchNode);
export const Settings = icon("settings", SettingsNode);
export const Sun = icon("sun", SunNode);
export const Trash2 = icon("trash-2", Trash2Node);
export const UserRound = icon("user-round", UserRoundNode);
export const X = icon("x", XNode);
export const XIcon = X;
export const CheckIcon = Check;
export const ChevronRightIcon = ChevronRight;
export const CircleIcon = Circle;
export const ChevronDownIcon = ChevronDown;
export const ChevronUpIcon = ChevronUp;
