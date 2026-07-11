import { LegalSection, LegalTable } from "../LegalPageLayout";

/**
 * /legal/cookies — Spanish body (i18n Phase 2).
 *
 * Moved verbatim out of page.tsx so the page can switch bodies by locale,
 * EXCEPT §3, which was corrected against the app's real cookie config
 * (Lex operational flag, 2026-07-10). The editor's "verify before
 * publication" note was removed. Verified first-party cookies (prod, HTTPS):
 *   - __Secure-authjs.session-token  (Auth.js v5, session.maxAge = 30 days)
 *   - __Host-authjs.csrf-token       (Auth.js v5, session cookie)
 *   - NEXT_LOCALE                    (locale choice; max-age 1 year)
 * The old `sa_consent` row was dropped: no consent cookie/banner is set.
 */

const linkCls =
  "text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]";

const noteCls =
  "rounded-md border-l-2 border-[var(--color-hairline)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-tertiary)]";

export function CookiesEs() {
  return (
    <>
      <p>
        Esta política explica qué son las cookies, cuáles usamos en
        SubastasActivas, para qué sirven y cómo puedes gestionarlas. Tratamos las
        cookies conforme a la normativa europea de protección de datos y de
        privacidad en las comunicaciones electrónicas, así como a las directrices
        aplicables sobre cookies.
      </p>

      <LegalSection heading="1. ¿Qué son las cookies?">
        <p>
          Las cookies son pequeños archivos que un sitio web guarda en tu
          navegador cuando lo visitas. Sirven para que el sitio funcione,
          recordar tus preferencias o entender cómo se usa. Algunas son
          imprescindibles para que el Servicio funcione; otras solo se usan si tú
          lo autorizas.
        </p>
      </LegalSection>

      <LegalSection heading="2. Tu consentimiento">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Las cookies{" "}
            <strong className="text-[var(--color-ink-primary)]">
              técnicas o necesarias
            </strong>{" "}
            no requieren tu consentimiento: sin ellas el sitio no funciona.
          </li>
          <li>
            Para el resto de cookies (analíticas y de terceros), te pedimos tu
            consentimiento mediante un banner de cookies la primera vez que
            entras. Puedes aceptar todas, rechazarlas o configurarlas una a una.
          </li>
          <li>
            Puedes cambiar o retirar tu consentimiento en cualquier momento desde
            el enlace de configuración de cookies del sitio o desde tu navegador.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Tipos de cookies que usamos">
        <h3 className="font-display text-base font-semibold text-[var(--color-ink-primary)]">
          Cookies técnicas / necesarias (siempre activas)
        </h3>
        <LegalTable
          head={["Cookie", "Finalidad", "Duración"]}
          rows={[
            [
              <code key="c" className="text-[var(--color-ink-primary)]">
                __Secure-authjs.session-token
              </code>,
              "Mantener tu sesión iniciada de forma segura.",
              "Sesión / hasta 30 días",
            ],
            [
              <code key="c" className="text-[var(--color-ink-primary)]">
                __Host-authjs.csrf-token
              </code>,
              "Seguridad: protección frente a ataques CSRF.",
              "Sesión",
            ],
            [
              <code key="c" className="text-[var(--color-ink-primary)]">
                NEXT_LOCALE
              </code>,
              "Recordar tu preferencia de idioma (español/inglés).",
              "12 meses",
            ],
          ]}
        />
        <p className={noteCls}>
          Tecnologías similares: el sitio también utiliza el almacenamiento de
          sesión del navegador (sessionStorage) para recordar, solo durante la
          sesión actual, preferencias técnicas como haber descartado la vista de
          «subastas cerca de ti». Esta información no sale de tu navegador y se
          elimina al cerrar la pestaña. La provincia aproximada que permite esa
          vista se estima de forma transitoria a partir de tu conexión (IP) y no
          se almacena.
        </p>

        <h3 className="pt-2 font-display text-base font-semibold text-[var(--color-ink-primary)]">
          Cookies de terceros — pago (requieren tu consentimiento si no son
          estrictamente necesarias)
        </h3>
        <LegalTable
          head={["Proveedor", "Finalidad", "Más información"]}
          rows={[
            [
              <strong key="p" className="text-[var(--color-ink-primary)]">
                Whop
              </strong>,
              "Procesar pagos y gestionar suscripciones de forma segura en el proceso de pago. Whop puede establecer cookies propias en su página de pago (por ejemplo, para seguridad de la sesión de pago y prevención del fraude).",
              "Política de privacidad y de cookies de Whop.",
            ],
          ]}
        />
        <p className={noteCls}>
          Las cookies de Whop se establecen únicamente cuando accedes al proceso
          de pago/suscripción. Para más detalle sobre las cookies que utiliza
          Whop, consulta la política de cookies del proveedor en su sitio.
        </p>
        <p className={noteCls}>
          El sitio no utiliza, por el momento, herramientas de analítica de
          terceros (como Google Analytics). Si en el futuro se incorporan, esta
          política y el banner de cookies se actualizarán en consecuencia.
        </p>
      </LegalSection>

      <LegalSection heading="4. Cómo gestionar o eliminar las cookies">
        <p>Puedes gestionar las cookies de dos formas:</p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Desde nuestro panel de configuración de cookies
            </strong>
            , accesible desde el banner o desde el enlace correspondiente en el
            sitio.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Desde tu navegador
            </strong>
            , donde puedes bloquear o eliminar las cookies ya almacenadas. Aquí
            tienes las guías oficiales:
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
          Ten en cuenta que, si desactivas las cookies técnicas, es posible que
          algunas funciones del Servicio no funcionen correctamente.
        </p>
      </LegalSection>

      <LegalSection heading="5. Cambios en esta política">
        <p>
          Podemos actualizar esta Política de Cookies si cambian las cookies que
          usamos o la normativa. La versión vigente será siempre la publicada en
          esta página, con su fecha.
        </p>
      </LegalSection>

      <LegalSection heading="6. Contacto">
        <p>
          Para cualquier duda sobre el uso de cookies:{" "}
          <a href="mailto:dennis.kotlenko@gmail.com" className={linkCls}>
            dennis.kotlenko@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}
