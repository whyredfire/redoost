import { createEffect, createSignal, Show } from "solid-js";

import { Phrase } from "@/components/detent/components/phrase/phrase";
import { ExpiryDate, presets, useExpiry } from "@/components/expiry-select";
import { Hint } from "@/components/hint";
import { RefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDate, siteUrl } from "@/lib/format";
import { loadToken } from "@/lib/session";

interface NewSiteSettingsProps {
  slug: string | null;
  onSlug: (slug: string) => void;
  expiresAt: string | null;
  onExpiry: (expiresAt: string | null) => void;
  disabled: boolean;
}

export const NewSiteSettings = (props: NewSiteSettingsProps) => {
  const [options, setOptions] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(false);

  const [preset, choose] = useExpiry(
    () => props.expiresAt,
    (expiresAt) => props.onExpiry(expiresAt)
  );

  const suggest = async () => {
    const token = loadToken();

    if (!token) {
      return;
    }

    setLoading(true);

    try {
      const slugs = await api(token).suggestSlugs();
      setOptions(slugs);

      if (slugs[0]) {
        props.onSlug(slugs[0]);
      }
    } catch {
      // WARNING: ignored on purpose, since the server picks an address when publishing
    } finally {
      setLoading(false);
    }
  };

  createEffect(
    () => props.slug,
    (slug) => {
      if (slug === null) {
        void suggest();
      }
    }
  );

  const address = () =>
    props.slug && siteUrl(props.slug)?.replace(/^https?:\/\//u, "");

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
            options: presets.map((option) => option[2]),
          },
          ".",
        ]}
        value={{
          slug: props.slug ?? "",
          expiry: presets.find(([key]) => key === preset())?.[2] ?? "",
        }}
        onChange={(values) => {
          if (values.slug && values.slug !== props.slug) {
            props.onSlug(String(values.slug));
          }

          const next = presets.find((option) => option[2] === values.expiry);

          if (next && next[0] !== preset()) {
            choose(next[0]);
          }
        }}
        says={() => (address() ? `${address()} · ${offline()}` : offline())}
      />
      <Show when={preset() === "date"}>
        <ExpiryDate value={props.expiresAt} onChange={props.onExpiry} />
      </Show>
    </fieldset>
  );
};
