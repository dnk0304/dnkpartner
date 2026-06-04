/**
 * SeoIntroBlock — the ≥90-word, variable, data-driven intro block above the
 * auction grid on every SEO programmatic page (07 §3.2).
 *
 * Variable hooks: live count, min starting price, current date. These make
 * each page genuinely unique even with a shared template — competitors can't
 * dup what they don't have (07 wedge).
 */

import Link from 'next/link';

type Props = {
  count: number;
  noun: string;          // e.g. "viviendas", "subastas judiciales", "subastas en Madrid"
  location?: string;     // e.g. "Madrid", "España"
  minPrice?: number | null;
  guideHref?: string;    // contextual /guia/ link
  guideLabel?: string;
};

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function todayEs(): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}

export function SeoIntroBlock({ count, noun, location, minPrice, guideHref, guideLabel }: Props) {
  const where = location ? ` en ${location}` : ' en España';
  const priceLine =
    minPrice && minPrice > 0
      ? `El precio de salida más bajo ahora mismo es de ${EUR.format(minPrice)}.`
      : `Cada ficha enlaza directamente al BOE oficial para verificar precios y plazos.`;
  return (
    <section className="prose prose-sm max-w-none text-[--color-text] mb-6">
      <p>
        En SubastasActivas seguimos <strong>{count.toLocaleString('es-ES')} {noun}{where}</strong> y
        te mostramos el estado en vivo de cada una: si está abierta,
        celebrándose, suspendida o concluida. {priceLine}{' '}
        Cada ficha enlaza directamente al BOE oficial.
        {guideHref ? (
          <>
            {' '}
            ¿Cómo funcionan? →{' '}
            <Link href={guideHref} className="underline">
              {guideLabel ?? 'Lee la guía'}
            </Link>
            .
          </>
        ) : null}{' '}
        Datos actualizados el {todayEs()}.
      </p>
    </section>
  );
}
