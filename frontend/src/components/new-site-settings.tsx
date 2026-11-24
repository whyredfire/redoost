import { createEffect, createSignal, Show } from "solid-js";
import { Phrase } from "@/components/detent/components/phrase/Phrase";
import { ExpiryDate, presets, useExpiry } from "@/components/expiry-select";
import { Hint } from "@/components/hint";
import { RefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { suggestSlugs } from "@/lib/deploy";
import { formatDate, siteUrl } from "@/lib/format";
import { loadToken } from "@/lib/session";

type NewSiteSettingsProps = {
  slug: string | null;
  onSlug: (slug: string) => void;
  expiresAt: string | null;
  onExpiry: (expiresAt: string | null) => void;
  disabled: boolean;
};

// Where a new site goes and how long it stays, read as one sentence
export function NewSiteSettings(props: NewSiteSettingsProps) {
  const [options, setOptions] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [preset, choose] = useExpiry(
    () => props.expiresAt,
    (expiresAt) => props.onExpiry(expiresAt),
  );

  async function suggest() {
    const token = loadToken();
    if (!token) return;
    setLoading(true);
    try {
      const slugs = await suggestSlugs(token);
      setOptions(slugs);
      if (slugs[0]) props.onSlug(slugs[0]);
    } catch {
      // Then the server picks one when publishing
    } finally {
      setLoading(false);
    }
  }

  createEffect(
    () => props.slug,
    (slug) => {
      if (slug === null) void suggest();
    },
  );

  const address = () =>
    props.slug && siteUrl(props.slug)?.replace(/^https?:\/\//, "");
  const offline = () =>
    props.expiresAt
      ? `goes offline on ${formatDate(props.expiresAt)}`
      : "stays online until you delete it";

  return (
    <fieldset class="mt-4 space-y-2" disabled={props.disabled}>
      <Phrase
        title="New site"
        aside={
          <Hint label="Offer other addresses">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Offer other addresses"
              disabled={loading()}
              onClick={suggest}
            >
              <RefreshCw class={loading() ? "animate-spin" : ""} />
            </Button>
          </Hint>
        }
        parts={[
          "Publish it at ",
          options().length > 0
            ? { id: "slug", label: "Address", options: options() }
            : (props.slug ?? "an address picked for you"),
          " and keep it online ",
          {
            id: "expiry",
            label: "Expires",
            options: presets.map(([, , words]) => words),
          },
          ".",
        ]}
        value={{
          slug: props.slug ?? "",
          expiry: presets.find(([key]) => key === preset())![2],
        }}
        onChange={(values) => {
          if (values.slug && values.slug !== props.slug)
            props.onSlug(String(values.slug));
          const next = presets.find(([, , words]) => words === values.expiry);
          if (next && next[0] !== preset()) choose(next[0]);
        }}
        says={() => (address() ? `${address()} · ${offline()}` : offline())}
      />
      <Show when={preset() === "date"}>
        <ExpiryDate value={props.expiresAt} onChange={props.onExpiry} />
      </Show>
    </fieldset>
  );
}
