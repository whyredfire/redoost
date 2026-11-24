import { createSignal } from "solid-js";

export function useCopy() {
  const [copied, setCopied] = createSignal(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return { copied, copy };
}
