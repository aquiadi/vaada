import type { ReactNode } from "react";
import { LegalEntity, OwnerDetail, usePublishedContact } from "./OwnerDetails";
import { Clause, Placeholder, PolicySheet } from "./PolicySheet";

function Entry({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 border-t hairline py-3 first:border-t-0 first:pt-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="label pt-1">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function EmailAddress({ email }: { email: string }) {
  if (!email) return <Placeholder>Support email to be added</Placeholder>;
  return (
    <a href={`mailto:${email}`} className="break-all">
      {email}
    </a>
  );
}

export function ContactUs() {
  const contact = usePublishedContact();
  return (
    <PolicySheet slug="contact" lede="Write to us about a deed, a payment, a refund or your data. We aim to reply within two working days.">
      <Clause n={1} title="Where to find us">
        <dl>
          <Entry label="Operated by">
            <LegalEntity />
          </Entry>
          <Entry label="Registered address">
            {contact.address ? (
              <address className="whitespace-pre-line not-italic">{contact.address}</address>
            ) : (
              <Placeholder>Registered address to be added</Placeholder>
            )}
          </Entry>
          <Entry label="Email">
            <EmailAddress email={contact.email} />
          </Entry>
          <Entry label="Phone">
            {contact.phone ? (
              <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="figures">
                {contact.phone}
              </a>
            ) : (
              <Placeholder>Phone number to be added</Placeholder>
            )}
          </Entry>
        </dl>
      </Clause>

      <Clause n={2} title="About a deed or a payment">
        <p>
          Send the deed’s link, or the deed number printed at its head, and say whether you are the maker or the client. If money left
          your account but the deed doesn’t show it as paid, add the time you paid; we will trace it with Razorpay.
        </p>
        <p>Never send us a card number, a UPI PIN or a one-time code. We will never ask for them.</p>
      </Clause>

      <Clause n={3} title="Grievance officer">
        <p>
          Under the Information Technology Act, 2000, the Consumer Protection (E-Commerce) Rules, 2020 and the Digital Personal Data
          Protection Act, 2023, you may address a complaint to our grievance officer. We acknowledge every complaint within 48 hours
          and resolve it within one month.
        </p>
        <dl>
          <Entry label="Name">
            <OwnerDetail value={contact.grievance_officer} missing="Grievance officer’s name to be added" />
          </Entry>
          <Entry label="Email">
            <EmailAddress email={contact.email} />
          </Entry>
        </dl>
      </Clause>
    </PolicySheet>
  );
}
