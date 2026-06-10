import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout, LegalSection } from "../LegalPageLayout";

/**
 * /legal/aviso-legal — Aviso Legal y Condiciones Generales de Uso.
 *
 * Copy: Lex's finalized legal draft (2026-06-10) rendered verbatim into the
 * shared LegalPageLayout / LegalSection shell. Operator identity
 * (DK Partner EOOD / EIK 207413740), Whop as payment processor, the
 * refund/desistimiento clause and the EU law-framing are all intentional —
 * do NOT genericize. Only the editor's "⚠️ borrador" IA banner was stripped.
 */

export const metadata: Metadata = {
  title: "Aviso legal — SubastasActivas",
  description:
    "Aviso legal y condiciones de uso del sitio web SubastasActivas.",
  alternates: { canonical: "/legal/aviso-legal" },
};

const linkCls =
  "text-[var(--color-action)] underline underline-offset-4 hover:text-[var(--color-action-hover)]";

export default function AvisoLegalPage() {
  return (
    <LegalPageLayout
      title="Aviso legal y condiciones generales de uso"
      updated="10 de junio de 2026"
    >
      <LegalSection heading="1. Quiénes somos (información del titular)">
        <p>
          En cumplimiento de la normativa europea sobre servicios de la
          sociedad de la información, te informamos de los datos del titular y
          operador de este sitio web:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Titular / operador:
            </strong>{" "}
            DK Partner EOOD (sociedad unipersonal de responsabilidad limitada
            constituida en Bulgaria).
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
            https://subastasactivas.com (en adelante, «SubastasActivas» o «el
            Servicio»)
          </li>
        </ul>
        <p>
          SubastasActivas es operado desde la Unión Europea por DK Partner EOOD
          y se dirige a usuarios de habla hispana interesados en subastas
          públicas.
        </p>
      </LegalSection>

      <LegalSection heading="2. Qué es SubastasActivas (objeto del servicio)">
        <p>
          SubastasActivas es un{" "}
          <strong className="text-[var(--color-ink-primary)]">
            servicio web de seguimiento y avisos de subastas públicas
          </strong>
          . Reunimos información de subastas publicadas por organismos
          oficiales —entre ellos el BOE (Boletín Oficial del Estado), la AEAT
          (Agencia Tributaria), los juzgados y la TGSS (Tesorería General de la
          Seguridad Social)— y te avisamos cuando cambia el estado de una
          subasta que sigues.
        </p>
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            Es muy importante que entiendas lo siguiente:
          </strong>
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            SubastasActivas es un servicio informativo y de avisos.{" "}
            <strong className="text-[var(--color-ink-primary)]">
              No organizamos subastas, no gestionamos pujas, no intermediamos
              en ninguna operación y no somos parte en ninguna subasta.
            </strong>
          </li>
          <li>
            La fuente oficial y válida de cada subasta es siempre el organismo
            público que la publica. Nuestra información es una ayuda para el
            seguimiento, no un sustituto de las fuentes oficiales.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Descargo de responsabilidad: ausencia de afiliación">
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            SubastasActivas no está afiliada, asociada, autorizada, respaldada
            por, ni conectada oficialmente de ninguna manera con ninguna entidad
            ni administración pública.
          </strong>{" "}
          Únicamente recopilamos y mostramos en un solo lugar información de
          acceso público. Las marcas, nombres y referencias a organismos
          oficiales se utilizan exclusivamente con fines descriptivos e
          identificativos de la fuente.
        </p>
      </LegalSection>

      <LegalSection heading="4. Aceptación de estas condiciones">
        <p>
          El acceso y uso de SubastasActivas te atribuye la condición de usuario
          e implica que aceptas, plena y sin reservas, este Aviso Legal y estas
          Condiciones Generales de Uso, así como nuestra Política de Privacidad.
          Si no estás de acuerdo con alguna de ellas, no debes utilizar el
          Servicio.
        </p>
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            Contratación de planes de pago (aceptación al suscribirte):
          </strong>{" "}
          cuando contratas un plan de pago, la aceptación de estas Condiciones,
          de la Política de Privacidad y, en particular, de la cláusula de
          reembolso y renuncia al desistimiento (sección 6) se realiza al hacer
          clic en el botón «Suscribirme» en el proceso de pago. Junto a dicho
          botón se muestra el aviso correspondiente con los enlaces a estos
          documentos. Al hacer clic en «Suscribirme», confirmas que has leído y
          aceptas estas condiciones.
        </p>
      </LegalSection>

      <LegalSection heading="5. Registro y cuenta de usuario">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Para usar las funciones del Servicio necesitas crear una cuenta con
            tu correo electrónico.
          </li>
          <li>
            Debes ser{" "}
            <strong className="text-[var(--color-ink-primary)]">
              mayor de 18 años
            </strong>{" "}
            y tener capacidad legal para contratar.
          </li>
          <li>
            Eres responsable de la veracidad de los datos que facilitas y de
            mantener la confidencialidad de tus credenciales de acceso. Cualquier
            actividad realizada desde tu cuenta se considerará realizada por ti.
          </li>
          <li>
            Avísanos de inmediato si detectas un uso no autorizado de tu cuenta.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Planes, suscripciones, cancelación y reembolsos">
        <p>
          SubastasActivas ofrece un plan gratuito y planes de pago con funciones
          adicionales (creación de alertas, seguimiento avanzado, etc.). Los
          precios y características de cada plan están disponibles en la página
          de precios del sitio.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">Pago:</strong>{" "}
            los pagos de los planes de suscripción se gestionan a través de
            Whop, nuestro proveedor de pago y suscripciones. SubastasActivas no
            almacena los datos completos de tu tarjeta.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Renovación:
            </strong>{" "}
            salvo que se indique lo contrario, las suscripciones se renuevan
            automáticamente al final de cada periodo.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Cancelación:
            </strong>{" "}
            puedes cancelar tu suscripción en cualquier momento desde tu cuenta.
            La cancelación evita futuras renovaciones; conservas el acceso hasta
            el final del periodo ya pagado.
          </li>
        </ul>
        <p>
          <strong className="text-[var(--color-ink-primary)]">
            Reembolsos y derecho de desistimiento (importante):
          </strong>
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Como consumidor, dispones de un derecho de desistimiento de 14 días
            naturales desde la contratación de un plan de pago.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Te reembolsaremos la cuota
            </strong>{" "}
            del periodo contratado si, dentro de esos 14 días, no has utilizado
            ninguna función de pago del Servicio (por ejemplo, crear una
            alerta).
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Renuncia al desistimiento por uso:
            </strong>{" "}
            al suscribirte (clic en «Suscribirme»), solicitas y consientes de
            forma expresa que el servicio digital se ponga a tu disposición de
            forma inmediata, y reconoces que pierdes el derecho de desistimiento
            en cuanto empiezas a utilizar una función de pago (por ejemplo, al
            crear una alerta). A partir de ese momento, no habrá derecho a
            reembolso de la cuota en curso.
          </li>
          <li>
            Esta renuncia se ajusta a la normativa de consumo de la UE y al
            artículo 103.m del Texto Refundido de la Ley General para la Defensa
            de los Consumidores y Usuarios (Real Decreto Legislativo 1/2007),
            aplicable a los consumidores residentes en España.
          </li>
        </ul>
        <p>
          Podemos modificar los precios comunicándolo con antelación; los nuevos
          precios solo se aplican a periodos de facturación posteriores.
        </p>
      </LegalSection>

      <LegalSection heading="7. Uso aceptable">
        <p>
          Te comprometes a usar SubastasActivas de forma lícita y conforme a
          estas condiciones. En particular, no está permitido:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Usar el Servicio con fines ilícitos o que perjudiquen derechos de
            terceros.
          </li>
          <li>
            Extraer masivamente nuestros datos o contenidos (scraping, robots,
            etc.) sin autorización escrita.
          </li>
          <li>
            Realizar pruebas de seguridad, escaneos de vulnerabilidades o
            intentos de intrusión sin nuestro permiso previo por escrito.
          </li>
          <li>
            Revender, ceder o explotar comercialmente el Servicio sin
            autorización.
          </li>
          <li>
            Intentar acceder a cuentas, datos o sistemas que no te pertenezcan.
          </li>
        </ul>
        <p>
          El incumplimiento puede dar lugar a la suspensión o cancelación
          inmediata de tu cuenta.
        </p>
      </LegalSection>

      <LegalSection heading="8. Limitación de responsabilidad (cláusula clave)">
        <p>
          Esta es una sección esencial para un servicio de información como el
          nuestro. Léela con atención:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Carácter informativo:
            </strong>{" "}
            la información que ofrece SubastasActivas tiene carácter meramente
            informativo y no constituye asesoramiento legal, financiero, fiscal
            ni profesional de ningún tipo. Cualquier decisión que tomes
            (participar o no en una subasta, pujar, etc.) es responsabilidad
            exclusivamente tuya.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Exactitud de los datos:
            </strong>{" "}
            trabajamos para que la información sea correcta y esté actualizada,
            pero los datos proceden de fuentes oficiales de terceros que pueden
            contener errores, retrasos o cambios. No garantizamos la exactitud,
            integridad ni la actualización en tiempo real de la información, y no
            nos hacemos responsables de los daños derivados de decisiones tomadas
            sobre la base de dicha información. Verifica siempre los datos en la
            fuente oficial antes de actuar.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Avisos y disponibilidad:
            </strong>{" "}
            ponemos medios razonables para que los avisos lleguen correctamente,
            pero no garantizamos que todos los avisos se entreguen sin fallos ni
            retrasos, ni la disponibilidad ininterrumpida del Servicio. Pueden
            producirse interrupciones por mantenimiento, fallos técnicos o causas
            ajenas a nosotros.
          </li>
          <li>
            <strong className="text-[var(--color-ink-primary)]">
              Enlaces a terceros:
            </strong>{" "}
            el Servicio puede contener enlaces a webs de organismos oficiales u
            otros terceros, sobre cuyo contenido no tenemos control ni
            responsabilidad.
          </li>
        </ul>
        <p>
          En la máxima medida permitida por la ley, SubastasActivas no responde
          por daños indirectos, lucro cesante o pérdidas derivadas del uso o de
          la imposibilidad de uso del Servicio. Nada en esta cláusula limita las
          responsabilidades que legalmente no puedan excluirse (por ejemplo,
          frente a consumidores).
        </p>
      </LegalSection>

      <LegalSection heading="9. Propiedad intelectual e industrial">
        <p>
          Todos los elementos de SubastasActivas (diseño, código, marca,
          logotipos, textos, estructura y presentación de la información) son
          titularidad de DK Partner EOOD o se usan con autorización, y están
          protegidos por la normativa de propiedad intelectual e industrial. No
          se permite su reproducción, distribución o transformación sin
          autorización escrita, salvo el uso personal propio del Servicio.
        </p>
      </LegalSection>

      <LegalSection heading="10. Suspensión y cancelación del servicio">
        <p>
          Podemos suspender o cancelar tu acceso, total o parcialmente, en caso
          de incumplimiento de estas condiciones, uso fraudulento o impago de la
          suscripción. Cuando sea razonable y posible, te lo comunicaremos
          previamente.
        </p>
      </LegalSection>

      <LegalSection heading="11. Protección de datos">
        <p>
          El tratamiento de tus datos personales se rige por nuestra{" "}
          <Link href="/legal/privacidad" className={linkCls}>
            Política de Privacidad
          </Link>{" "}
          y nuestra{" "}
          <Link href="/legal/cookies" className={linkCls}>
            Política de Cookies
          </Link>
          , que forman parte de estas condiciones.
        </p>
      </LegalSection>

      <LegalSection heading="12. Modificación de las condiciones">
        <p>
          Podemos actualizar este Aviso Legal y estas Condiciones para
          adaptarlos a cambios legales o del Servicio. La versión vigente será
          siempre la publicada en esta página, con su fecha de actualización. Si
          los cambios son relevantes, procuraremos avisarte.
        </p>
      </LegalSection>

      <LegalSection heading="13. Nulidad parcial">
        <p>
          Si alguna cláusula de estas condiciones se declarara nula o
          inaplicable, el resto seguirá siendo válido y se interpretará
          respetando la finalidad del conjunto.
        </p>
      </LegalSection>

      <LegalSection heading="14. Ley aplicable y jurisdicción">
        <p>
          El operador del Servicio, DK Partner EOOD, está establecido en la
          Unión Europea (Bulgaria), y el Servicio se rige por el Derecho de la
          UE aplicable a los servicios prestados a distancia.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Si eres{" "}
            <strong className="text-[var(--color-ink-primary)]">
              consumidor
            </strong>
            , conservas la protección que te garantizan las normas imperativas
            de consumo de tu país de residencia en la UE. En el caso de
            consumidores residentes en España, se aplica la normativa española
            de protección de los consumidores y podrás acudir a los juzgados de
            tu domicilio. Además, como consumidor de la UE, puedes acudir a la
            plataforma de resolución de litigios en línea de la Comisión
            Europea:{" "}
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
            Si actúas como{" "}
            <strong className="text-[var(--color-ink-primary)]">
              empresa o profesional
            </strong>
            , las partes se someten a la jurisdicción correspondiente al
            domicilio del operador, salvo norma imperativa en contrario.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="15. Contacto">
        <p>
          Para cualquier consulta sobre este Aviso Legal o el Servicio,
          escríbenos a:{" "}
          <a href="mailto:dennis.kotlenko@gmail.com" className={linkCls}>
            dennis.kotlenko@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
