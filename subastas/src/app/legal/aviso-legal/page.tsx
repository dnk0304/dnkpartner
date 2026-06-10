import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "../LegalPageLayout";

/**
 * /legal/aviso-legal — Aviso Legal.
 *
 * ⚠️ v1 PLACEHOLDER COPY — boilerplate structure only, pending Dennis's
 * final, lawyer-reviewed legal text. The page chrome + metadata are
 * production-ready; the wording must be reviewed and replaced before this
 * is relied upon as a binding legal notice.
 */

export const metadata: Metadata = {
  title: "Aviso legal — SubastasActivas",
  description:
    "Aviso legal y condiciones de uso del sitio web SubastasActivas.",
  alternates: { canonical: "/legal/aviso-legal" },
};

export default function AvisoLegalPage() {
  return (
    <LegalPageLayout title="Aviso legal" updated="10 de junio de 2026">
      <p>
        El presente aviso legal regula el uso del sitio web SubastasActivas
        (en adelante, &laquo;el Sitio&raquo;). El acceso y la navegación por el
        Sitio implican la aceptación de las condiciones recogidas en este aviso.
      </p>

      <LegalSection heading="1. Titular del sitio">
        <p>
          Responsable: SubastasActivas. Para cualquier comunicación puede
          dirigirse a la dirección de correo electrónico{" "}
          <a
            href="mailto:dennis.kotlenko@gmail.com"
            className="text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]"
          >
            dennis.kotlenko@gmail.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="2. Objeto del sitio">
        <p>
          SubastasActivas es un servicio de información que recopila y organiza
          datos públicos sobre subastas judiciales, administrativas y notariales
          publicadas en fuentes oficiales (BOE y otros boletines). La información
          se ofrece con fines informativos y no constituye asesoramiento legal,
          financiero ni de inversión.
        </p>
      </LegalSection>

      <LegalSection heading="3. Exactitud de la información">
        <p>
          Los datos mostrados proceden de fuentes oficiales y se actualizan
          periódicamente. SubastasActivas no garantiza la ausencia de errores ni
          la disponibilidad permanente del Sitio. Antes de tomar cualquier
          decisión, el usuario debe verificar la información en la fuente oficial
          correspondiente.
        </p>
      </LegalSection>

      <LegalSection heading="4. Propiedad intelectual">
        <p>
          Los contenidos, marcas y elementos de diseño del Sitio están
          protegidos por la normativa de propiedad intelectual e industrial. Los
          datos de subastas pertenecen a sus fuentes oficiales públicas.
        </p>
      </LegalSection>

      <LegalSection heading="5. Legislación aplicable">
        <p>
          Este aviso legal se rige por la legislación española. Para la
          resolución de cualquier controversia, las partes se someten a los
          juzgados y tribunales que correspondan conforme a derecho.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
