import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "../LegalPageLayout";

/**
 * /legal/cookies — Política de Cookies.
 *
 * ⚠️ v1 PLACEHOLDER COPY — boilerplate structure only, pending Dennis's
 * final, lawyer-reviewed text and an accurate cookie inventory. Page chrome
 * + metadata are production-ready; wording and the cookie table are
 * provisional.
 */

export const metadata: Metadata = {
  title: "Política de cookies — SubastasActivas",
  description:
    "Información sobre el uso de cookies en el sitio web SubastasActivas.",
  alternates: { canonical: "/legal/cookies" },
};

export default function CookiesPage() {
  return (
    <LegalPageLayout title="Política de cookies" updated="10 de junio de 2026">
      <p>
        Esta política explica qué son las cookies y cómo las utiliza
        SubastasActivas. Una cookie es un pequeño archivo de texto que se
        almacena en tu dispositivo cuando visitas el Sitio.
      </p>

      <LegalSection heading="1. Cookies que utilizamos">
        <p>
          Utilizamos cookies técnicas necesarias para el funcionamiento del
          Sitio, como las que mantienen tu sesión iniciada. Estas cookies son
          imprescindibles y no requieren consentimiento.
        </p>
      </LegalSection>

      <LegalSection heading="2. Cookies de terceros">
        <p>
          Podemos utilizar servicios de terceros (por ejemplo, de
          autenticación o de análisis de uso). Estos servicios pueden establecer
          sus propias cookies, sujetas a sus respectivas políticas de privacidad.
        </p>
      </LegalSection>

      <LegalSection heading="3. Gestión de cookies">
        <p>
          Puedes configurar tu navegador para aceptar, rechazar o eliminar las
          cookies. Ten en cuenta que deshabilitar las cookies técnicas puede
          afectar al funcionamiento del Sitio, por ejemplo impidiendo mantener tu
          sesión iniciada.
        </p>
      </LegalSection>

      <LegalSection heading="4. Contacto">
        <p>
          Si tienes dudas sobre nuestra política de cookies, escríbenos a{" "}
          <a
            href="mailto:dennis.kotlenko@gmail.com"
            className="text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]"
          >
            dennis.kotlenko@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
