import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "../legal/LegalPageLayout";

/**
 * /contacto — Contact page.
 *
 * Intentionally minimal: email-only ("Escríbenos") + a short "Sobre
 * SubastasActivas" blurb. The full operator identity (DK Partner EOOD /
 * EIK 207413740) lives in /legal/aviso-legal and /legal/privacidad, so this
 * page stays a quiet contact surface. Reuses the legal page layout for
 * visual consistency. Contact email: dennis.kotlenko@gmail.com.
 */

export const metadata: Metadata = {
  title: "Contacto — SubastasActivas",
  description:
    "Ponte en contacto con el equipo de SubastasActivas.",
  alternates: { canonical: "/contacto" },
};

export default function ContactoPage() {
  return (
    <LegalPageLayout title="Contacto">
      <p>
        ¿Tienes una pregunta, una sugerencia o has detectado un error en los
        datos? Estaremos encantados de ayudarte.
      </p>

      <LegalSection heading="Escríbenos">
        <p>
          La forma más rápida de contactar con nosotros es por correo
          electrónico:
        </p>
        <p>
          <a
            href="mailto:dennis.kotlenko@gmail.com"
            className="text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)] font-medium"
          >
            dennis.kotlenko@gmail.com
          </a>
        </p>
        <p>
          Intentamos responder a todas las consultas lo antes posible. Si tu
          mensaje se refiere a una subasta concreta, incluye el enlace o la
          referencia para que podamos ayudarte mejor.
        </p>
      </LegalSection>

      <LegalSection heading="Sobre SubastasActivas">
        <p>
          SubastasActivas recopila y organiza la información pública de subastas
          judiciales, administrativas y notariales de España, y te avisa cuando
          algo cambia. Toda la información procede de fuentes oficiales.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
