import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { suggestSlugs } from "@/lib/deploy";
import { loadToken } from "@/lib/session";

type AddressPickerProps = {
  slug: string | null;
  onChange: (slug: string) => void;
  disabled: boolean;
};

export function AddressPicker({
  slug,
  onChange,
  disabled,
}: AddressPickerProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function suggest() {
    const token = loadToken();
    if (!token) return;
    setLoading(true);
    try {
      const slugs = await suggestSlugs(token);
      setOptions(slugs);
      if (slugs[0]) onChange(slugs[0]);
    } catch {
      // Then the server picks one when publishing
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug === null) void suggest();
  }, [slug]);

  return (
    <fieldset className="mt-4 space-y-1.5" disabled={disabled}>
      <div className="flex items-center justify-between">
        <legend className="text-sm text-muted-foreground">Address</legend>
        <Hint label="Offer other addresses">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Offer other addresses"
            disabled={disabled || loading}
            onClick={suggest}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </Hint>
      </div>
      {options.length > 0 ? (
        <div className="divide-y overflow-hidden rounded-lg border">
          {options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 font-mono text-sm transition-colors hover:bg-muted/40 has-checked:bg-muted"
            >
              <input
                type="radio"
                name="site-address"
                className="accent-brand"
                value={option}
                checked={option === slug}
                onChange={() => onChange(option)}
              />
              {option}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Picked for you</p>
      )}
    </fieldset>
  );
}
