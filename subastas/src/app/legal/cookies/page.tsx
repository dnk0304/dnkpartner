import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "../LegalPageLayout";

/**
 * /legal/cookies — Política de Cookies.
 *
 * Copy: Lex's finalized cookies draft (2026-06-10) rendered verbatim. The
 * técnicas/necesarias rows (next-auth session + csrf + consent cookie) and
 * the Whop checkout-cookies block are intentional. Only the "⚠️ borrador" IA
 * banner was stripped. Cookie schedules render as lightweight, muted,
 * hairline-bordered semantic tables (name / purpose / duration read clearer
 * than prose).
 */

export const metadata: Metadata = {
  title: "Política de cookies — SubastasActivas",
  description:
    "Información sobre el uso de cookies en el sitio web SubastasActivas.",
  alternates: { canonical: "/legal/cookies" },
};

const linkCls =
  "text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]";

const noteCls =
  "rounded-md border-l-2 border-[var(--color-hairline)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-ink-tertiary)]";

/** Lightweight, muted, hairline-bordered table for the cookie schedules. */
function LegalTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-hairline)]">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="py-2 pr-4 align-top font-semibold text-[var(--color-ink-primary)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr
              key={i}
              className="border-b border-[var(--color-hairline-soft)] last:border-0"
            >
              {cells.map((cell, j) => (
                <td
                  key={j}
                  className="py-2.5 pr-4 align-top text-[var(--color-ink-secondary)]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CookiesPage() {
  return (
    <LegalPageLayout title="Política de cookies" updated="10 de junio de 2026">
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
                next-auth.session-token
              </code>,
              "Mantener tu sesión iniciada de forma segura.",
              "Sesión / hasta 30 días",
            ],
            [
              <code key="c" className="text-[var(--color-ink-primary)]">
                next-auth.csrf-token
              </code>,
              "Seguridad: protección frente a ataques CSRF.",
              "Sesión",
            ],
            [
              <code key="c" className="text-[var(--color-ink-primary)]">
                sa_consent
              </code>,
              "Recordar tus preferencias de cookies.",
              "12 meses",
            ],
          ]}
        />
        <p className={noteCls}>
          Nota técnica: los nombres y duraciones exactos de las cookies de sesión
          deben verificarse con la configuración real del sitio antes de la
          publicación final.
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
    </LegalPageLayout>
  );
}
