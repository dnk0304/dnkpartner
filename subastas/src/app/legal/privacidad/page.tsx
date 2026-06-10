import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "../LegalPageLayout";

/**
 * /legal/privacidad — Política de Privacidad.
 *
 * ⚠️ v1 PLACEHOLDER COPY — boilerplate structure only, pending Dennis's
 * final, lawyer-reviewed text (RGPD / LOPDGDD compliance must be verified).
 * Page chrome + metadata are production-ready; wording is provisional.
 */

export const metadata: Metadata = {
  title: "Política de privacidad — SubastasActivas",
  description:
    "Cómo SubastasActivas recopila, utiliza y protege tus datos personales.",
  alternates: { canonical: "/legal/privacidad" },
};

export default function PrivacidadPage() {
  return (
    <LegalPageLayout title="Política de privacidad" updated="10 de junio de 2026">
      <p>
        En SubastasActivas nos tomamos en serio la protección de tus datos
        personales. Esta política explica qué información recogemos, con qué
        finalidad y cuáles son tus derechos, conforme al Reglamento General de
        Protección de Datos (RGPD) y la normativa española aplicable.
      </p>

      <LegalSection heading="1. Responsable del tratamiento">
        <p>
          Responsable: SubastasActivas. Contacto:{" "}
          <a
            href="mailto:dennis.kotlenko@gmail.com"
            className="text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]"
          >
            dennis.kotlenko@gmail.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="2. Datos que recopilamos">
        <p>
          Recopilamos los datos que nos facilitas al crear una cuenta (correo
          electrónico) y al configurar alertas (criterios de búsqueda). También
          podemos recoger datos técnicos de uso para mejorar el servicio.
        </p>
      </LegalSection>

      <LegalSection heading="3. Finalidad del tratamiento">
        <p>
          Utilizamos tus datos para prestar el servicio (gestionar tu cuenta y
          enviarte las alertas que configures), para comunicarnos contigo sobre
          el servicio y para cumplir nuestras obligaciones legales.
        </p>
      </LegalSection>

      <LegalSection heading="4. Base legal">
        <p>
          La base legal del tratamiento es la ejecución del servicio que
          solicitas, tu consentimiento para las comunicaciones y el cumplimiento
          de obligaciones legales.
        </p>
      </LegalSection>

      <LegalSection heading="5. Conservación de los datos">
        <p>
          Conservamos tus datos mientras mantengas una cuenta activa y, después,
          durante los plazos legalmente exigibles. Puedes solicitar la supresión
          en cualquier momento.
        </p>
      </LegalSection>

      <LegalSection heading="6. Tus derechos">
        <p>
          Tienes derecho a acceder, rectificar, suprimir, limitar y oponerte al
          tratamiento de tus datos, así como a la portabilidad. Para ejercerlos,
          escríbenos a{" "}
          <a
            href="mailto:dennis.kotlenko@gmail.com"
            className="text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]"
          >
            dennis.kotlenko@gmail.com
          </a>
          . También puedes presentar una reclamación ante la Agencia Española de
          Protección de Datos.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
