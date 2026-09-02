import { LegalSection, LegalTable, BindingNotice } from "../LegalPageLayout";

/**
 * /legal/cookies — English body (i18n Phase 2).
 *
 * Transcribed VERBATIM from the Lex-APPROVED translation
 * (translation-audit/legal-en/cookies.en.md, 2026-07-10), EXCEPT §3, which
 * was corrected against the app's real cookie config (the single allowed
 * content edit — Lex operational flag). The editor's "verify before
 * publication" note was removed. Verified first-party cookies match the es
 * body 1:1. See content.es.tsx for the verified inventory.
 */

const linkCls =
  "text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]";

const noteCls =
  "rounded-md border-l-2 border-[var(--color-hairline)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-tertiary)]";

export function CookiesEn() {
  return (
    <>
      <BindingNotice />

      <p>
        This policy explains what cookies are, which ones we use on
        SubastasActivas, what they are for and how you can manage them. We handle
        cookies in accordance with European data protection and ePrivacy
        (privacy in electronic communications) regulations, as well as the
        applicable guidelines on cookies.
      </p>

      <LegalSection heading="1. What are cookies?">
        <p>
          Cookies are small files that a website stores in your browser when you
          visit it. They are used to make the site work, remember your
          preferences or understand how the site is used. Some are essential for
          the Service to function; others are only used if you authorise them.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your consent">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Technical or necessary
            </strong>{" "}
            cookies do not require your consent: without them the site does not
            work.
          </li>
          <li>
            For all other cookies (analytics and third-party cookies), we ask
            for your consent via a cookie banner the first time you visit. You
            can accept them all, reject them, or configure them one by one.
          </li>
          <li>
            You can change or withdraw your consent at any time via the
            site&apos;s cookie settings link or from your browser.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Types of cookies we use">
        <h3 className="font-display text-base font-semibold text-[var(--color-ink-primary)]">
          Technical / necessary cookies (always active)
        </h3>
        <LegalTable
          head={["Cookie", "Purpose", "Duration"]}
          rows={[
            [
              <code key="c" className="text-[var(--color-ink-primary)]">
                __Secure-authjs.session-token
              </code>,
              "Keeping you securely logged in.",
              "Session / up to 30 days",
            ],
            [
              <code key="c" className="text-[var(--color-ink-primary)]">
                __Host-authjs.csrf-token
              </code>,
              "Security: protection against CSRF attacks.",
              "Session",
            ],
            [
              <code key="c" className="text-[var(--color-ink-primary)]">
                NEXT_LOCALE
              </code>,
              "Remembering your language preference (Spanish/English).",
              "12 months",
            ],
          ]}
        />
        <p className={noteCls}>
          Similar technologies: the site also uses the browser&apos;s session
          storage (sessionStorage) to remember, only for the current session,
          technical preferences such as having dismissed the &quot;auctions near
          you&quot; view. This information does not leave your browser and is
          deleted when you close the tab. The approximate province that enables
          that view is estimated transiently from your connection (IP) and is
          not stored.
        </p>

        <h3 className="pt-2 font-display text-base font-semibold text-[var(--color-ink-primary)]">
          Third-party cookies — payment (require your consent if not strictly
          necessary)
        </h3>
        <LegalTable
          head={["Provider", "Purpose", "More information"]}
          rows={[
            [
              <strong key="p" className="text-[var(--color-ink-primary)]">
                Whop
              </strong>,
              "Processing payments and managing subscriptions securely during the checkout process. Whop may set its own cookies on its payment page (for example, for payment session security and fraud prevention).",
              "Whop's privacy and cookie policy.",
            ],
          ]}
        />
        <p className={noteCls}>
          Whop&apos;s cookies are set only when you enter the payment/subscription
          process. For more detail on the cookies Whop uses, see the
          provider&apos;s cookie policy on its website.
        </p>
        <p className={noteCls}>
          The site does not currently use third-party analytics tools (such as
          Google Analytics). If these are added in the future, this policy and
          the cookie banner will be updated accordingly.
        </p>
      </LegalSection>

      <LegalSection heading="4. How to manage or delete cookies">
        <p>You can manage cookies in two ways:</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              From our cookie settings panel
            </strong>
            , accessible from the banner or from the corresponding link on the
            site.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              From your browser
            </strong>
            , where you can block or delete cookies that are already stored. Here
            are the official guides:
            <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
              <li>
                <a
                  href="https://support.google.com/chrome/answer/95647"
                  className={linkCls}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Chrome
                </a>
              </li>
              <li>
                <a
                  href="https://support.mozilla.org/es/kb/proteccion-antirrastreo-mejorada-firefox-escritorio"
                  className={linkCls}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Mozilla Firefox
                </a>
              </li>
              <li>
                <a
                  href="https://support.apple.com/es-es/guide/safari/sfri11471/mac"
                  className={linkCls}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Safari
                </a>
              </li>
              <li>
                <a
                  href="https://support.microsoft.com/es-es/microsoft-edge"
                  className={linkCls}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Microsoft Edge
                </a>
              </li>
            </ul>
          </li>
        </ol>
        <p>
          Please note that if you disable technical cookies, some features of the
          Service may not work correctly.
        </p>
      </LegalSection>

      <LegalSection heading="5. Changes to this policy">
        <p>
          We may update this Cookie Policy if the cookies we use or the
          applicable regulations change. The version in force will always be the
          one published on this page, with its date.
        </p>
      </LegalSection>

      <LegalSection heading="6. Contact">
        <p>
          For any questions about the use of cookies:{" "}
          <a href="mailto:hola@subastasactivas.com" className={linkCls}>
            hola@subastasactivas.com
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}
