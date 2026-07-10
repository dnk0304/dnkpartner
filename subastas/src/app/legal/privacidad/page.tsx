import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout, LegalSection } from "../LegalPageLayout";

/**
 * /legal/privacidad — Política de Privacidad.
 *
 * Copy: Lex's finalized privacy draft (2026-06-10) rendered verbatim.
 * Responsable del tratamiento (DK Partner EOOD / EIK 207413740), the Whop
 * encargado row, the US international-transfer clause and the CPDP (Bulgaria)
 * lead-authority framing are all intentional. Only the "⚠️ borrador" IA
 * banner was stripped. Draft tables are rendered as lightweight, muted,
 * hairline-bordered semantic tables (category / purpose / location read
 * clearer than prose here).
 */

export const metadata: Metadata = {
  title: "Política de privacidad — SubastasActivas",
  description:
    "Cómo SubastasActivas recopila, utiliza y protege tus datos personales.",
  alternates: { canonical: "/legal/privacidad" },
};

const linkCls =
  "text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]";

/** Lightweight, muted, hairline-bordered table for the privacy schedules. */
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

export default function PrivacidadPage() {
  return (
    <LegalPageLayout
      title="Política de privacidad"
      updated="10 de julio de 2026"
    >
      <p>
        En SubastasActivas nos tomamos en serio tu privacidad. Aquí te
        explicamos, de forma clara, qué datos tratamos, para qué, con qué base
        legal, cuánto tiempo los guardamos y qué derechos tienes. Tratamos tus
        datos conforme al Reglamento (UE) 2016/679 (RGPD) y a la normativa de
        protección de datos aplicable en la UE.
      </p>

      <LegalSection heading="1. Responsable del tratamiento">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Responsable:
            </strong>{" "}
            DK Partner EOOD (sociedad unipersonal constituida en Bulgaria).
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Número de identificación de la sociedad (EIK):
            </strong>{" "}
            207413740
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Correo de contacto:
            </strong>{" "}
            <a href="mailto:dennis.kotlenko@gmail.com" className={linkCls}>
              dennis.kotlenko@gmail.com
            </a>
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Sitio web:
            </strong>{" "}
            https://subastasactivas.com
          </li>
        </ul>
        <p>
          El responsable está establecido en la Unión Europea (Bulgaria), por lo
          que el tratamiento se realiza bajo la protección del RGPD. No estamos
          obligados a designar un Delegado de Protección de Datos (DPO) por el
          tipo de actividad, pero puedes dirigir cualquier cuestión de
          privacidad al correo anterior.
        </p>
      </LegalSection>

      <LegalSection heading="2. Qué datos tratamos">
        <p>Tratamos únicamente los datos necesarios para prestarte el servicio:</p>
        <LegalTable
          head={["Categoría", "Datos"]}
          rows={[
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Datos de cuenta
              </strong>,
              "Nombre y dirección de correo electrónico.",
            ],
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Datos de autenticación
              </strong>,
              "Credenciales e información técnica de acceso (inicio de sesión por correo).",
            ],
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Preferencias de alertas
              </strong>,
              "Las subastas y criterios que decides seguir.",
            ],
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Datos de uso y analítica
              </strong>,
              "Información sobre cómo usas el sitio (páginas vistas, interacciones), de forma agregada o seudonimizada.",
            ],
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Datos de pago
              </strong>,
              "Si contratas un plan de pago, los datos de la transacción. El pago lo gestiona Whop, un proveedor externo; nosotros no almacenamos los datos completos de tu tarjeta. Ver secciones 6 y 7.",
            ],
            [
              <strong key="c" className="text-[var(--color-ink-primary)]">
                Cookies
              </strong>,
              <>
                Ver nuestra{" "}
                <Link href="/legal/cookies" className={linkCls}>
                  Política de Cookies
                </Link>
                .
              </>,
            ],
          ]}
        />
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            Ubicación aproximada:
          </strong>{" "}
          para mostrarte por defecto las subastas de tu zona, la página de
          inicio puede estimar de forma transitoria tu provincia aproximada a
          partir de tu conexión (dirección IP). Este dato se usa únicamente en
          el momento de la consulta para ordenar el contenido: no se almacena,
          no se asocia a tu cuenta ni se comparte con terceros. Tu ubicación
          precisa (GPS del navegador) solo se utiliza si la solicitas
          expresamente mediante la opción «Cerca de ti», y tampoco se almacena.
        </p>
        <p>
          No solicitamos ni tratamos categorías especiales de datos (salud,
          ideología, etc.). El Servicio está dirigido a mayores de 18 años.
        </p>
      </LegalSection>

      <LegalSection heading="3. Para qué usamos tus datos y con qué base legal">
        <LegalTable
          head={["Finalidad", "Base legal (RGPD)"]}
          rows={[
            [
              "Crear y gestionar tu cuenta y prestarte el Servicio.",
              "Ejecución del contrato (art. 6.1.b).",
            ],
            [
              "Enviarte las alertas y avisos de subastas que configures.",
              "Ejecución del contrato (art. 6.1.b).",
            ],
            [
              "Gestionar el cobro de las suscripciones de pago.",
              "Ejecución del contrato (art. 6.1.b) y obligaciones legales (art. 6.1.c).",
            ],
            [
              "Atender tus consultas y dar soporte.",
              "Ejecución del contrato / interés legítimo (art. 6.1.f).",
            ],
            [
              "Mantener la seguridad y prevenir el fraude.",
              "Interés legítimo (art. 6.1.f).",
            ],
            [
              "Analítica para mejorar el Servicio.",
              "Consentimiento (cookies) o interés legítimo según el caso.",
            ],
            [
              "Enviarte comunicaciones comerciales o newsletter, si te suscribes.",
              "Consentimiento (art. 6.1.a), revocable en cualquier momento.",
            ],
            [
              "Cumplir obligaciones legales (fiscales, contables).",
              "Obligación legal (art. 6.1.c).",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Durante cuánto tiempo guardamos tus datos">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Datos de cuenta y preferencias:
            </strong>{" "}
            mientras mantengas tu cuenta activa. Si la cancelas, los eliminamos o
            anonimizamos, salvo que debamos conservarlos por obligaciones
            legales.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Datos de facturación:
            </strong>{" "}
            durante los plazos exigidos por la normativa fiscal y mercantil
            aplicable.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Datos de soporte y consultas:
            </strong>{" "}
            el tiempo necesario para atenderlas y un periodo razonable posterior.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Datos para comunicaciones comerciales:
            </strong>{" "}
            hasta que retires tu consentimiento.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Dónde se alojan tus datos">
        <p>
          Tus datos se alojan en servidores situados en la Unión Europea:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">Hetzner</strong>{" "}
            (infraestructura de hosting, Alemania – UE).
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">Neon</strong>{" "}
            (base de datos PostgreSQL, UE).
          </li>
        </ul>
        <p>
          Al estar en la UE, tus datos quedan bajo la protección del RGPD sin
          necesidad de transferencias internacionales para el alojamiento
          principal.
        </p>
      </LegalSection>

      <LegalSection heading="6. Con quién compartimos tus datos (encargados del tratamiento)">
        <p>
          No vendemos ni cedemos tus datos personales a terceros con fines
          comerciales. Solo recurrimos a proveedores que nos ayudan a prestar el
          Servicio, que actúan como encargados del tratamiento y están obligados
          por contrato a proteger tus datos conforme al RGPD:
        </p>
        <LegalTable
          head={["Proveedor", "Finalidad", "Ubicación"]}
          rows={[
            [
              <strong key="p" className="text-[var(--color-ink-primary)]">
                Hetzner
              </strong>,
              "Hosting / infraestructura.",
              "Alemania (UE).",
            ],
            [
              <strong key="p" className="text-[var(--color-ink-primary)]">
                Neon
              </strong>,
              "Base de datos.",
              "UE.",
            ],
            [
              <strong key="p" className="text-[var(--color-ink-primary)]">
                Whop
              </strong>,
              "Procesamiento de pagos y gestión de suscripciones.",
              "Estados Unidos (ver sección 7).",
            ],
          ]}
        />
      </LegalSection>

      <LegalSection heading="7. Transferencias internacionales">
        <p>
          El alojamiento principal de tus datos es en la UE. Sin embargo,
          nuestro proveedor de pagos y suscripciones, Whop, está establecido en
          Estados Unidos, por lo que el tratamiento de los datos necesarios para
          procesar tu pago puede implicar una transferencia internacional fuera
          del Espacio Económico Europeo (EEE).
        </p>
        <p>
          Estas transferencias se realizan con las garantías adecuadas previstas
          por el RGPD (capítulo V), como las Cláusulas Contractuales Tipo
          aprobadas por la Comisión Europea y/o, en su caso, la adhesión del
          proveedor a un marco de adecuación aplicable (por ejemplo, el EU–US
          Data Privacy Framework). Estas garantías buscan asegurar que tus datos
          disfruten de un nivel de protección equivalente al del EEE.
        </p>
      </LegalSection>

      <LegalSection heading="8. Tus derechos">
        <p>Tienes derecho a:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">Acceso:</strong>{" "}
            saber qué datos tuyos tratamos.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Rectificación:
            </strong>{" "}
            corregir datos inexactos.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Supresión («derecho al olvido»):
            </strong>{" "}
            pedir que eliminemos tus datos.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Oposición:
            </strong>{" "}
            oponerte a determinados tratamientos.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Limitación:
            </strong>{" "}
            pedir que restrinjamos el tratamiento en ciertos casos.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Portabilidad:
            </strong>{" "}
            recibir tus datos en un formato estructurado y de uso común, o que
            los transmitamos a otro responsable.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Retirar el consentimiento
            </strong>{" "}
            en cualquier momento, sin que ello afecte a la licitud del
            tratamiento previo.
          </li>
        </ul>
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            Cómo ejercerlos:
          </strong>{" "}
          escríbenos a{" "}
          <a href="mailto:dennis.kotlenko@gmail.com" className={linkCls}>
            dennis.kotlenko@gmail.com
          </a>{" "}
          indicando el derecho que quieres ejercer. Podemos pedirte que acredites
          tu identidad. Responderemos en el plazo legal (un mes, ampliable en
          casos complejos).
        </p>
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            Reclamación ante la autoridad de control:
          </strong>{" "}
          como el responsable está establecido en Bulgaria, la autoridad de
          control principal es la Comisión para la Protección de Datos Personales
          de Bulgaria (CPDP / Комисия за защита на личните данни – КЗЛД) —{" "}
          <a
            href="https://www.cpdp.bg"
            className={linkCls}
            target="_blank"
            rel="noopener noreferrer"
          >
            www.cpdp.bg
          </a>
          . No obstante, si resides en otro país de la UE, también puedes
          presentar tu reclamación ante la autoridad de protección de datos de tu
          lugar de residencia (en España, la Agencia Española de Protección de
          Datos,{" "}
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

      <LegalSection heading="9. Seguridad">
        <p>
          Aplicamos medidas técnicas y organizativas razonables para proteger tus
          datos frente a accesos no autorizados, pérdida o alteración (control de
          acceso, cifrado en tránsito, copias de seguridad, etc.). En caso de una
          brecha de seguridad que afecte a tus datos, actuaremos conforme al
          RGPD, notificándolo a la autoridad de control competente y, cuando
          proceda, a los afectados.
        </p>
      </LegalSection>

      <LegalSection heading="10. Cambios en esta política">
        <p>
          Podemos actualizar esta Política de Privacidad para adaptarla a cambios
          legales o del Servicio. La versión vigente será siempre la publicada en
          esta página, con su fecha. Si los cambios son relevantes, te lo
          comunicaremos.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
