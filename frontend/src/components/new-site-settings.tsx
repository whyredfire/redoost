import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Phrase } from "@/components/detent/components/phrase/Phrase";
import { ExpiryDate, presets, useExpiry } from "@/components/expiry-select";
import { Hint } from "@/components/hint";
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
export function NewSiteSettings({
  slug,
  onSlug,
  expiresAt,
  onExpiry,
  disabled,
}: NewSiteSettingsProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [preset, choose] = useExpiry(expiresAt, onExpiry);

  async function suggest() {
    const token = loadToken();
    if (!token) return;
    setLoading(true);
    try {
      const slugs = await suggestSlugs(token);
      setOptions(slugs);
      if (slugs[0]) onSlug(slugs[0]);
    } catch {
      // Then the server picks one when publishing
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug === null) void suggest();
  }, [slug]);

  const address = slug && siteUrl(slug)?.replace(/^https?:\/\//, "");
  const offline = expiresAt
    ? `goes offline on ${formatDate(expiresAt)}`
    : "stays online until you delete it";

  return (
    <fieldset className="mt-4 space-y-2" disabled={disabled}>
      <Phrase
        title="New site"
        aside={
          <Hint label="Offer other addresses">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Offer other addresses"
              disabled={loading}
              onClick={suggest}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
            </Button>
          </Hint>
        }
        parts={[
          "Publish it at ",
          options.length > 0
            ? { id: "slug", label: "Address", options }
            : (slug ?? "an address picked for you"),
          " and keep it online ",
          {
            id: "expiry",
            label: "Expires",
            options: presets.map(([, , words]) => words),
          },
          ".",
        ]}
        value={{
          slug: slug ?? "",
          expiry: presets.find(([key]) => key === preset)![2],
        }}
        onChange={(values) => {
          if (values.slug && values.slug !== slug) onSlug(String(values.slug));
          const next = presets.find(([, , words]) => words === values.expiry);
          if (next && next[0] !== preset) choose(next[0]);
        }}
        says={() => (address ? `${address} · ${offline}` : offline)}
      />
      {preset === "date" && (
        <ExpiryDate value={expiresAt} onChange={onExpiry} />
      )}
    </fieldset>
  );
}
