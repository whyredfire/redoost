import { createFileRoute } from "@tanstack/react-router";
import { ContactLink, LegalPage, Section } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="2 October 2026">
      <Section title="Using redoost">
        <p>
          redoost hosts static sites for free. By publishing a site, you agree
          to these terms.
        </p>
      </Section>

      <Section title="Your sites">
        <p>
          You keep ownership of what you publish, and you're responsible for it.
          You let us store your sites and serve them publicly at their address.
        </p>
      </Section>

      <Section title="What's not allowed">
        <ul className="list-disc space-y-1 pl-5">
          <li>Phishing, or pretending to be someone else</li>
          <li>Malware, or anything that harms visitors' devices</li>
          <li>Illegal content, or content you don't have the rights to</li>
          <li>Spam, or using the service in a way that disrupts it</li>
        </ul>
        <p>
          We may remove sites or accounts that break these terms, without
          notice. To report a site, email <ContactLink />.
        </p>
      </Section>

      <Section title="No guarantees">
        <p>
          The service is provided as is, without warranties, and may change or
          stop at any time. Keep your own copies of your sites; we're not liable
          for lost data or for any damage from using the service.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          We may update these terms. The date at the top shows when they last
          changed.
        </p>
      </Section>
    </LegalPage>
  );
}
