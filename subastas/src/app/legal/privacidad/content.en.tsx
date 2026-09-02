import Link from "next/link";
import { LegalSection, LegalTable, BindingNotice } from "../LegalPageLayout";

/**
 * /legal/privacidad — English body (i18n Phase 2).
 *
 * Transcribed VERBATIM from the Lex-APPROVED translation
 * (translation-audit/legal-en/privacidad.en.md, 2026-07-10). Frozen copy;
 * structure mirrors the es body 1:1. Internal links point to the /en space.
 */

const linkCls =
  "text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]";

export function PrivacidadEn() {
  return (
    <>
      <BindingNotice />

      <p>
        At SubastasActivas we take your privacy seriously. Here we explain, in
        clear terms, what data we process, for what purposes, on what legal
        basis, how long we keep it and what rights you have. We process your
        data in accordance with Regulation (EU) 2016/679 (GDPR) and the data
        protection regulations applicable in the EU.
      </p>

      <LegalSection heading="1. Data controller">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Controller:
            </strong>{" "}
            DK Partner EOOD (a single-member company incorporated in Bulgaria).
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Company identification number (EIK):
            </strong>{" "}
            207413740
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Contact email:
            </strong>{" "}
            <a href="mailto:hola@subastasactivas.com" className={linkCls}>
              hola@subastasactivas.com
            </a>
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Website:
            </strong>{" "}
            https://subastasactivas.com
          </li>
        </ul>
        <p>
          The controller is established in the European Union (Bulgaria), so the
          processing is carried out under the protection of the GDPR. We are not
          required to appoint a Data Protection Officer (DPO) given the nature
          of our activity, but you can direct any privacy question to the email
          address above.
        </p>
      </LegalSection>

      <LegalSection heading="2. What data we process">
        <p>We process only the data necessary to provide you with the service:</p>
        <LegalTable
          head={["Category", "Data"]}
          rows={[
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Account data
              </strong>,
              "Name and email address.",
            ],
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Authentication data
              </strong>,
              "Credentials and technical login information (email-based sign-in).",
            ],
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Alert preferences
              </strong>,
              "The auctions and criteria you choose to follow.",
            ],
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Usage and analytics data
              </strong>,
              "Information about how you use the site (pages viewed, interactions), in aggregated or pseudonymised form.",
            ],
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Payment data
              </strong>,
              "If you purchase a paid plan, the transaction data. Payment is handled by Whop, an external provider; we do not store your full card details. See sections 6 and 7.",
            ],
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Cookies
              </strong>,
              <>
                See our{" "}
                <Link href="/en/legal/cookies" className={linkCls}>
                  Cookie Policy
                </Link>
                .
              </>,
            ],
          ]}
        />
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            Approximate location:
          </strong>{" "}
          in order to show you the auctions in your area by default, the home
          page may transiently estimate your approximate province from your
          connection (IP address). This data is used only at the moment of the
          query to order the content: it is not stored, not associated with your
          account and not shared with third parties. Your precise location
          (browser GPS) is only used if you expressly request it via the «Cerca
          de ti» (&quot;Near you&quot;) option, and it is not stored either.
        </p>
        <p>
          We do not request or process special categories of data (health,
          ideology, etc.). The Service is aimed at people over 18 years of age.
        </p>
      </LegalSection>

      <LegalSection heading="3. What we use your data for and on what legal basis">
        <LegalTable
          head={["Purpose", "Legal basis (GDPR)"]}
          rows={[
            [
              "Creating and managing your account and providing you with the Service.",
              "Performance of the contract (Art. 6(1)(b)).",
            ],
            [
              "Sending you the auction alerts and notifications you configure.",
              "Performance of the contract (Art. 6(1)(b)).",
            ],
            [
              "Managing the billing of paid subscriptions.",
              "Performance of the contract (Art. 6(1)(b)) and legal obligations (Art. 6(1)(c)).",
            ],
            [
              "Handling your enquiries and providing support.",
              "Performance of the contract / legitimate interest (Art. 6(1)(f)).",
            ],
            [
              "Maintaining security and preventing fraud.",
              "Legitimate interest (Art. 6(1)(f)).",
            ],
            [
              "Analytics to improve the Service.",
              "Consent (cookies) or legitimate interest, depending on the case.",
            ],
            [
              "Sending you commercial communications or a newsletter, if you subscribe.",
              "Consent (Art. 6(1)(a)), revocable at any time.",
            ],
            [
              "Complying with legal obligations (tax, accounting).",
              "Legal obligation (Art. 6(1)(c)).",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. How long we keep your data">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Account data and preferences:
            </strong>{" "}
            for as long as you keep your account active. If you cancel it, we
            delete or anonymise the data, unless we must retain it due to legal
            obligations.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Billing data:
            </strong>{" "}
            for the periods required by the applicable tax and commercial
            regulations.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Support and enquiry data:
            </strong>{" "}
            for the time necessary to handle them and a reasonable period
            thereafter.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Data for commercial communications:
            </strong>{" "}
            until you withdraw your consent.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Where your data is hosted">
        <p>
          Your data is hosted on servers located in the European Union:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">Hetzner</strong>{" "}
            (hosting infrastructure, Germany – EU).
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">Neon</strong>{" "}
            (PostgreSQL database, EU).
          </li>
        </ul>
        <p>
          Being in the EU, your data remains under the protection of the GDPR
          without the need for international transfers for the main hosting.
        </p>
      </LegalSection>

      <LegalSection heading="6. Who we share your data with (data processors)">
        <p>
          We do not sell or transfer your personal data to third parties for
          commercial purposes. We only use providers that help us deliver the
          Service, which act as data processors and are contractually obliged to
          protect your data in accordance with the GDPR:
        </p>
        <LegalTable
          head={["Provider", "Purpose", "Location"]}
          rows={[
            [
              <strong key="p" className="text-[var(--color-ink-primary)]">
                Hetzner
              </strong>,
              "Hosting / infrastructure.",
              "Germany (EU).",
            ],
            [
              <strong key="p" className="text-[var(--color-ink-primary)]">
                Neon
              </strong>,
              "Database.",
              "EU.",
            ],
            [
              <strong key="p" className="text-[var(--color-ink-primary)]">
                Whop
              </strong>,
              "Payment processing and subscription management.",
              "United States (see section 7).",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="7. International transfers">
        <p>
          The main hosting of your data is in the EU. However, our payment and
          subscription provider, Whop, is established in the United States, so
          the processing of the data necessary to process your payment may
          involve an international transfer outside the European Economic Area
          (EEA).
        </p>
        <p>
          These transfers are carried out with the appropriate safeguards
          provided for by the GDPR (Chapter V), such as the Standard Contractual
          Clauses approved by the European Commission and/or, where applicable,
          the provider&apos;s adherence to an applicable adequacy framework (for
          example, the EU–US Data Privacy Framework). These safeguards are
          intended to ensure that your data enjoys a level of protection
          equivalent to that of the EEA.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your rights">
        <p>You have the right to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">Access:</strong>{" "}
            know what data of yours we process.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Rectification:
            </strong>{" "}
            correct inaccurate data.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Erasure (&quot;right to be forgotten&quot;):
            </strong>{" "}
            ask us to delete your data.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Objection:
            </strong>{" "}
            object to certain processing operations.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Restriction:
            </strong>{" "}
            ask us to restrict processing in certain cases.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Portability:
            </strong>{" "}
            receive your data in a structured, commonly used format, or have us
            transmit it to another controller.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Withdraw your consent
            </strong>{" "}
            at any time, without this affecting the lawfulness of the prior
            processing.
          </li>
        </ul>
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            How to exercise them:
          </strong>{" "}
          write to us at{" "}
          <a href="mailto:hola@subastasactivas.com" className={linkCls}>
            hola@subastasactivas.com
          </a>{" "}
          indicating the right you wish to exercise. We may ask you to verify
          your identity. We will respond within the legal deadline (one month,
          extendable in complex cases).
        </p>
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            Complaint to the supervisory authority:
          </strong>{" "}
          as the controller is established in Bulgaria, the lead supervisory
          authority is Bulgaria&apos;s Commission for Personal Data Protection
          (CPDP / Комисия за защита на личните данни – КЗЛД) —{" "}
          <a
            href="https://www.cpdp.bg"
            className={linkCls}
            target="_blank"
            rel="noopener noreferrer"
          >
            www.cpdp.bg
          </a>
          . However, if you reside in another EU country, you may also lodge
          your complaint with the data protection authority of your place of
          residence (in Spain, the Agencia Española de Protección de Datos
          (Spanish Data Protection Agency),{" "}
          <a
            href="https://www.aepd.es"
            className={linkCls}
            target="_blank"
            rel="noopener noreferrer"
          >
            www.aepd.es
          </a>
          ).
        </p>
      </LegalSection>

      <LegalSection heading="9. Security">
        <p>
          We apply reasonable technical and organisational measures to protect
          your data against unauthorised access, loss or alteration (access
          control, encryption in transit, backups, etc.). In the event of a
          security breach affecting your data, we will act in accordance with
          the GDPR, notifying the competent supervisory authority and, where
          appropriate, the affected individuals.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to this policy">
        <p>
          We may update this Privacy Policy to adapt it to legal changes or
          changes to the Service. The version in force will always be the one
          published on this page, with its date. If the changes are significant,
          we will notify you.
        </p>
      </LegalSection>
    </>
  );
}
