import Link from "next/link";
import { LegalSection, BindingNotice } from "../LegalPageLayout";

/**
 * /legal/aviso-legal — English body (i18n Phase 2).
 *
 * Transcribed VERBATIM from the Lex-APPROVED translation
 * (translation-audit/legal-en/aviso-legal.en.md, 2026-07-10). Frozen copy:
 * structure mirrors the es body 1:1. Internal links point to the /en space
 * so an English reader stays in English.
 */

const linkCls =
  "text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]";

export function AvisoLegalEn() {
  return (
    <>
      <BindingNotice />

      <LegalSection heading="1. Who we are (owner information)">
        <p>
          In compliance with European regulations on information society
          services, we inform you of the details of the owner and operator of
          this website:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Owner / operator:
            </strong>{" "}
            DK Partner EOOD (a single-member limited liability company
            incorporated in Bulgaria).
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
            <a href="mailto:dennis.kotlenko@gmail.com" className={linkCls}>
              dennis.kotlenko@gmail.com
            </a>
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Website:
            </strong>{" "}
            https://subastasactivas.com (hereinafter, &laquo;SubastasActivas&raquo;
            or &laquo;the Service&raquo;)
          </li>
        </ul>
        <p>
          SubastasActivas is operated from the European Union by DK Partner EOOD
          and is aimed at Spanish-speaking users interested in public auctions.
        </p>
      </LegalSection>

      <LegalSection heading="2. What SubastasActivas is (purpose of the service)">
        <p>
          SubastasActivas is a{" "}
          <strong className="text-[var(--color-ink-primary)]">
            web service for tracking and receiving alerts about public auctions
          </strong>
          . We gather information on auctions published by official bodies —
          including the BOE (Boletín Oficial del Estado, Spain&apos;s Official
          State Gazette), the AEAT (Agencia Tributaria, the Spanish Tax Agency),
          the courts and the TGSS (Tesorería General de la Seguridad Social, the
          Spanish Social Security General Treasury) — and we notify you when the
          status of an auction you follow changes.
        </p>
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            It is very important that you understand the following:
          </strong>
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            SubastasActivas is an information and alert service.{" "}
            <strong className="text-[var(--color-ink-primary)]">
              We do not organise auctions, we do not manage bids, we do not act
              as an intermediary in any transaction and we are not a party to
              any auction.
            </strong>
          </li>
          <li>
            The official and valid source for each auction is always the public
            body that publishes it. Our information is an aid for tracking, not
            a substitute for official sources.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Disclaimer: no affiliation">
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            SubastasActivas is not affiliated, associated, authorised, endorsed
            by, or in any way officially connected with any public entity or
            public administration.
          </strong>{" "}
          We merely collect and display publicly accessible information in a
          single place. Trademarks, names and references to official bodies are
          used exclusively for descriptive purposes and to identify the source.
        </p>
      </LegalSection>

      <LegalSection heading="4. Acceptance of these terms">
        <p>
          Accessing and using SubastasActivas gives you the status of user and
          implies that you accept, fully and without reservation, this Legal
          Notice and these General Terms of Use, as well as our Privacy Policy.
          If you do not agree with any of them, you must not use the Service.
        </p>
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            Purchasing paid plans (acceptance upon subscribing):
          </strong>{" "}
          when you purchase a paid plan, acceptance of these Terms, of the
          Privacy Policy and, in particular, of the refund and withdrawal-waiver
          clause (section 6) takes place when you click the «Suscribirme»
          (&quot;Subscribe&quot;) button in the checkout process. The
          corresponding notice, with links to these documents, is displayed next
          to that button. By clicking «Suscribirme» (&quot;Subscribe&quot;), you
          confirm that you have read and accept these terms.
        </p>
      </LegalSection>

      <LegalSection heading="5. Registration and user account">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            To use the Service&apos;s features you need to create an account
            with your email address.
          </li>
          <li>
            You must be{" "}
            <strong className="text-[var(--color-ink-primary)]">
              over 18 years of age
            </strong>{" "}
            and have legal capacity to enter into contracts.
          </li>
          <li>
            You are responsible for the accuracy of the information you provide
            and for keeping your login credentials confidential. Any activity
            carried out from your account will be deemed to have been carried
            out by you.
          </li>
          <li>
            Notify us immediately if you detect unauthorised use of your account.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Plans, subscriptions, cancellation and refunds">
        <p>
          SubastasActivas offers a free plan and paid plans with additional
          features (creating alerts, advanced tracking, etc.). The prices and
          features of each plan are available on the site&apos;s pricing page.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Payment:
            </strong>{" "}
            payments for subscription plans are handled through Whop, our payment
            and subscription provider. SubastasActivas does not store your full
            card details.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Renewal:
            </strong>{" "}
            unless otherwise indicated, subscriptions renew automatically at the
            end of each period.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Cancellation:
            </strong>{" "}
            you can cancel your subscription at any time from your account.
            Cancellation prevents future renewals; you retain access until the
            end of the period already paid for.
          </li>
        </ul>
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            Refunds and right of withdrawal (important):
          </strong>
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            As a consumer, you have a right of withdrawal of 14 calendar days
            from the purchase of a paid plan.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              We will refund the fee
            </strong>{" "}
            for the contracted period if, within those 14 days, you have not
            used any paid feature of the Service (for example, creating an
            alert).
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Waiver of the right of withdrawal through use:
            </strong>{" "}
            by subscribing (clicking «Suscribirme» (&quot;Subscribe&quot;)), you
            expressly request and consent that the digital service be made
            available to you immediately, and you acknowledge that you lose the
            right of withdrawal as soon as you begin to use a paid feature (for
            example, when you create an alert). From that moment on, there will
            be no right to a refund of the current fee.
          </li>
          <li>
            This waiver complies with EU consumer regulations and with Article
            103.m of the Consolidated Text of the General Law for the Defence of
            Consumers and Users (Texto Refundido de la Ley General para la
            Defensa de los Consumidores y Usuarios, Royal Legislative Decree
            1/2007), applicable to consumers resident in Spain.
          </li>
        </ul>
        <p>
          We may change prices by giving advance notice; new prices only apply
          to subsequent billing periods.
        </p>
      </LegalSection>

      <LegalSection heading="7. Acceptable use">
        <p>
          You undertake to use SubastasActivas lawfully and in accordance with
          these terms. In particular, the following is not permitted:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Using the Service for unlawful purposes or purposes that harm the
            rights of third parties.
          </li>
          <li>
            Mass-extracting our data or content (scraping, robots, etc.) without
            written authorisation.
          </li>
          <li>
            Carrying out security tests, vulnerability scans or intrusion
            attempts without our prior written permission.
          </li>
          <li>
            Reselling, assigning or commercially exploiting the Service without
            authorisation.
          </li>
          <li>
            Attempting to access accounts, data or systems that do not belong to
            you.
          </li>
        </ul>
        <p>
          Non-compliance may result in the immediate suspension or termination
          of your account.
        </p>
      </LegalSection>

      <LegalSection heading="8. Limitation of liability (key clause)">
        <p>
          This is an essential section for an information service like ours.
          Please read it carefully:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Informational nature:
            </strong>{" "}
            the information provided by SubastasActivas is purely informational
            and does not constitute legal, financial, tax or professional advice
            of any kind. Any decision you make (whether or not to participate in
            an auction, to bid, etc.) is exclusively your own responsibility.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Accuracy of the data:
            </strong>{" "}
            we work to keep the information correct and up to date, but the data
            comes from official third-party sources that may contain errors,
            delays or changes. We do not guarantee the accuracy, completeness or
            real-time currency of the information, and we are not liable for
            damages arising from decisions made on the basis of that
            information. Always verify the data at the official source before
            acting.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Alerts and availability:
            </strong>{" "}
            we use reasonable means to ensure that alerts are delivered
            correctly, but we do not guarantee that all alerts will be delivered
            without failures or delays, nor the uninterrupted availability of
            the Service. Interruptions may occur due to maintenance, technical
            failures or causes beyond our control.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Links to third parties:
            </strong>{" "}
            the Service may contain links to websites of official bodies or
            other third parties, over whose content we have no control and for
            which we accept no responsibility.
          </li>
        </ul>
        <p>
          To the maximum extent permitted by law, SubastasActivas is not liable
          for indirect damages, loss of profit or losses arising from the use
          of, or inability to use, the Service. Nothing in this clause limits
          liabilities that cannot legally be excluded (for example, towards
          consumers).
        </p>
      </LegalSection>

      <LegalSection heading="9. Intellectual and industrial property">
        <p>
          All elements of SubastasActivas (design, code, brand, logos, texts,
          structure and presentation of the information) are owned by DK Partner
          EOOD or used with authorisation, and are protected by intellectual and
          industrial property regulations. Their reproduction, distribution or
          transformation is not permitted without written authorisation, except
          for personal use inherent to the Service.
        </p>
      </LegalSection>

      <LegalSection heading="10. Suspension and termination of the service">
        <p>
          We may suspend or terminate your access, in whole or in part, in the
          event of a breach of these terms, fraudulent use or non-payment of the
          subscription. Where reasonable and possible, we will notify you in
          advance.
        </p>
      </LegalSection>

      <LegalSection heading="11. Data protection">
        <p>
          The processing of your personal data is governed by our{" "}
          <Link href="/en/legal/privacidad" className={linkCls}>
            Privacy Policy
          </Link>{" "}
          and our{" "}
          <Link href="/en/legal/cookies" className={linkCls}>
            Cookie Policy
          </Link>
          , which form part of these terms.
        </p>
      </LegalSection>

      <LegalSection heading="12. Changes to the terms">
        <p>
          We may update this Legal Notice and these Terms to adapt them to legal
          changes or changes to the Service. The version in force will always be
          the one published on this page, with its update date. If the changes
          are significant, we will endeavour to notify you.
        </p>
      </LegalSection>

      <LegalSection heading="13. Partial invalidity">
        <p>
          If any clause of these terms is declared void or unenforceable, the
          remainder will remain valid and will be interpreted in keeping with
          the purpose of the whole.
        </p>
      </LegalSection>

      <LegalSection heading="14. Governing law and jurisdiction">
        <p>
          The operator of the Service, DK Partner EOOD, is established in the
          European Union (Bulgaria), and the Service is governed by the EU law
          applicable to services provided at a distance.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            If you are a{" "}
            <strong className="text-[var(--color-ink-primary)]">
              consumer
            </strong>
            , you retain the protection guaranteed to you by the mandatory
            consumer rules of your country of residence in the EU. In the case
            of consumers resident in Spain, Spanish consumer protection
            legislation applies and you may bring proceedings before the courts
            of your place of domicile. In addition, as an EU consumer, you may
            use the European Commission&apos;s online dispute resolution
            platform:{" "}
            <a
              href="https://ec.europa.eu/consumers/odr"
              className={linkCls}
              target="_blank"
              rel="noopener noreferrer"
            >
              https://ec.europa.eu/consumers/odr
            </a>
          </li>
          <li>
            If you act as a{" "}
            <strong className="text-[var(--color-ink-primary)]">
              business or professional
            </strong>
            , the parties submit to the jurisdiction corresponding to the
            operator&apos;s domicile, unless a mandatory rule provides otherwise.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="15. Contact">
        <p>
          For any enquiry about this Legal Notice or the Service, write to us
          at:{" "}
          <a href="mailto:dennis.kotlenko@gmail.com" className={linkCls}>
            dennis.kotlenko@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}
