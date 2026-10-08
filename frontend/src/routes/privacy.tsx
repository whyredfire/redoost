import { createFileRoute } from "@tanstack/react-router";
import { ContactLink, LegalPage, Section } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="9 October 2026">
      <Section title="What we store">
        <p>
          When you sign in with Google, we store your Google account ID, email
          address, and name, to know which sites are yours. We don't receive
          your password or access anything else in your Google account.
        </p>
        <p>
          The files of sites you publish are stored until you delete them, and
          are public at their site address.
        </p>
        <p>
          Our servers keep standard logs, such as IP addresses and the pages
          requested, to keep the service running and to prevent abuse.
        </p>
      </Section>

      <Section title="What stays in your browser">
        <p>
          Your sign-in token, theme, and unfinished uploads are kept in your
          browser's storage. We don't use cookies, analytics, or ads.
        </p>
      </Section>

      <Section title="Sharing">
        <p>
          We don't sell or share your information. Google handles signing in,
          under its own privacy policy.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          You can delete your sites at any time from Your sites, and your
          account with everything stored with it from the account menu. For
          anything else, email <ContactLink />.
        </p>
      </Section>
    </LegalPage>
  );
}
