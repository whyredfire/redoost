import { cn } from "cn";
import { LogIn } from "lucide-react";
import { ProviderLogo } from "@/components/provider-logo";
import { Button } from "@/components/ui/button";
import { authConfig, providerNames, signIn } from "@/lib/auth";

type SignInPromptProps = {
  title: string;
  description: string;
  className?: string;
};

export function SignInPrompt({
  title,
  description,
  className,
}: SignInPromptProps) {
  const { oidc } = authConfig;
  if (!oidc) return null;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border-2 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <LogIn className="size-5 text-muted-foreground" />
      </div>
      <p className="text-lg font-medium">{title}</p>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{description}</p>
      <Button onClick={signIn}>
        <ProviderLogo provider={oidc.provider} />
        Sign in with {providerNames[oidc.provider]}
      </Button>
    </div>
  );
}
