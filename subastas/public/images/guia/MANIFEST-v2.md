# Guía image library — MANIFEST v2 (GAP covers)

29 additional bespoke covers, one per previously-uncovered `/guia` article, so **zero**
articles fall back to the generic/cluster cover. Same locked house style, model, format
and IP rules as the first 50 (see `MANIFEST.md`).

- **Model:** OpenAI **GPT Image 2** (`openai/gpt-image-2`) via Replicate (proxy billing), quality `high`.
- **Style:** identical locked house style — deep pine green + warm gold on pale frost-mint, soft
  dimensional shading, paper grain, hairline concentric-arc motifs, upper-left light, generous
  negative space. Verified visually consistent with the original 50 (one family).
- **Format:** `.webp`, 1536×1024 (3:2), each ≤200 KB (actual range 49–144 KB).
- **IP-clean:** no text/numbers/logos/BOE·AEAT·TGSS·court crests/flags/real faces. Original artwork only.
- **Filenames = EXACT article slug:** `cover-<slug>.webp`. No renaming needed — wire `imageUrl` directly.
- **Location:** `public/images/guia/` → served at `/images/guia/<file>`.

## How to wire (for Ken / SAGA)

These 29 filenames already match their article slug exactly, so the UPDATE is mechanical.
Run after migration `20260712_add_article_image_url` is applied (adds `Article."imageUrl"`).
Note: the importer resets `imageAlt` from `.md` on re-import but never touches `imageUrl` — so
`imageUrl` set here survives; re-run the `imageAlt` half after any re-import.

```sql
BEGIN;
UPDATE "Article" SET "imageUrl"='/images/guia/cover-6-webs-subastas.webp',                       "imageAlt"='Varias ventanas de portales de subastas y una lupa dorada'          WHERE slug='6-webs-subastas';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-certificado-digital-subastas-boe.webp',      "imageAlt"='Tarjeta de certificado digital con chip y escudo con candado'       WHERE slug='certificado-digital-subastas-boe';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-cesion-de-remate.webp',                      "imageAlt"='Paleta de subasta y una llave que pasa de una mano a otra'          WHERE slug='cesion-de-remate';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-conceptos-basicos-subastas.webp',            "imageAlt"='Libro abierto junto a una maza, una llave y una moneda'            WHERE slug='conceptos-basicos-subastas';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-crear-alertas-subastas.webp',                "imageAlt"='Campana de alerta con aviso junto a una vivienda'                   WHERE slug='crear-alertas-subastas';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-deposito-subastas-seguridad-social.webp',    "imageAlt"='Monedas con candado y edificio institucional de la Seguridad Social' WHERE slug='deposito-subastas-seguridad-social';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-edicto-subasta-como-leerlo.webp',            "imageAlt"='Edicto de subasta con una lupa que examina sus campos'              WHERE slug='edicto-subasta-como-leerlo';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-glosario-terminos-subastas.webp',            "imageAlt"='Libro de referencia con índice alfabético y una maza'               WHERE slug='glosario-terminos-subastas';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-guia-completa-comprar-subasta.webp',         "imageAlt"='Guía abierta con una ruta e iconos de llave, maza y moneda'         WHERE slug='guia-completa-comprar-subasta';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-inscribir-decreto-adjudicacion-registro.webp',"imageAlt"='Decreto sellado que entra en el libro del registro de la propiedad' WHERE slug='inscribir-decreto-adjudicacion-registro';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-invertir-subastas-rentabilidad.webp',        "imageAlt"='Vivienda junto a un gráfico ascendente y monedas'                   WHERE slug='invertir-subastas-rentabilidad';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-mapa-subastas-provincia.webp',               "imageAlt"='Mapa de provincias con un marcador de ubicación y una vivienda'     WHERE slug='mapa-subastas-provincia';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-requisitos-participar-subasta.webp',         "imageAlt"='Lista de verificación con DNI y una moneda'                         WHERE slug='requisitos-participar-subasta';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-bienes-muebles-apremio.webp',        "imageAlt"='Bienes muebles apilados con etiqueta de subasta'                    WHERE slug='subasta-bienes-muebles-apremio';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-division-cosa-comun.webp',           "imageAlt"='Vivienda dividida por una línea central junto a una maza'           WHERE slug='subasta-division-cosa-comun';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-garaje-hacienda.webp',               "imageAlt"='Puerta de garaje con documento fiscal y moneda'                     WHERE slug='subasta-garaje-hacienda';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-judicial-voluntaria.webp',           "imageAlt"='Maza judicial y una mano que ofrece una llave'                      WHERE slug='subasta-judicial-voluntaria';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-maquinaria-industrial.webp',         "imageAlt"='Maquinaria industrial con engranaje y etiqueta de subasta'          WHERE slug='subasta-maquinaria-industrial';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-mobiliario-seguridad-social.webp',   "imageAlt"='Mobiliario con etiqueta y edificio de la Seguridad Social'          WHERE slug='subasta-mobiliario-seguridad-social';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-trasteros-via-apremio.webp',         "imageAlt"='Trastero con persiana entreabierta y etiqueta de subasta'           WHERE slug='subasta-trasteros-via-apremio';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-vehiculos-seguridad-social.webp',    "imageAlt"='Coche con etiqueta y edificio de la Seguridad Social'               WHERE slug='subasta-vehiculos-seguridad-social';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-vehiculos.webp',                     "imageAlt"='Coche genérico en subasta junto a una paleta'                       WHERE slug='subasta-vehiculos';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-vivienda-seguridad-social.webp',     "imageAlt"='Bloque de viviendas con llave y edificio de la Seguridad Social'    WHERE slug='subasta-vivienda-seguridad-social';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subasta-vs-compra-tradicional.webp',         "imageAlt"='Dos viviendas comparadas: subasta frente a compra tradicional'      WHERE slug='subasta-vs-compra-tradicional';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-subastas-seguridad-social-paso-a-paso.webp',  "imageAlt"='Edificio de la Seguridad Social con una ruta de pasos hacia una llave' WHERE slug='subastas-seguridad-social-paso-a-paso';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-tablon-anuncios-subastas-seguridad-social.webp',"imageAlt"='Tablón de anuncios con avisos y edificio de la Seguridad Social'    WHERE slug='tablon-anuncios-subastas-seguridad-social';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-tanteo-y-retracto-administracion.webp',      "imageAlt"='Edificio de la Administración que toma primero una llave de vivienda' WHERE slug='tanteo-y-retracto-administracion';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-tipos-de-subastas-secundarias-espana.webp',  "imageAlt"='Tres columnas con iconos de los tipos de subasta secundaria'        WHERE slug='tipos-de-subastas-secundarias-espana';
UPDATE "Article" SET "imageUrl"='/images/guia/cover-ventajas-comprar-subasta-publica.webp',      "imageAlt"='Vivienda con flecha ascendente, etiqueta de descuento y visto bueno' WHERE slug='ventajas-comprar-subasta-publica';
-- expect 29 rows updated
COMMIT;
```

## Coverage result

- Original wiring (MANIFEST.md / SAGA `guia-image-wiring.sql`): 26 bespoke covers.
- This v2: **29 more** bespoke covers, exact-slug named.
- **26 + 29 = 55 of 55** publishable `/guia` articles now carry a unique bespoke cover.
  `INDEX.md` is not an article. **Zero articles remain on the generic/cluster fallback.**
- The 12 cluster covers + `cover-generic.webp` remain in place as a safety net for any future
  article added without its own cover.
