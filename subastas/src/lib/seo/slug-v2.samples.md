# slug-v2 — sample URLs for Dennis's shape sign-off

**Generated 2026-08-03 from the LIVE prod corpus** (240,890 `Auction` rows), by running the
real generators against a full DB dump:

```
npx tsx scripts/slug-v2-samples.ts corpus.b64        # this table
npx tsx scripts/slug-v2-corpus-proof.ts corpus.b64   # the uniqueness proof
```

Nothing is wired yet. Routes, sitemap emission and the resolver are all still on the old
`/subastas/subasta/{tipo}-{provincia}-{municipio}-{id}` shape. **This is the sign-off gate:
once these URLs ship they are permanent — there is no redirect machinery.**

## Shape

```
/{province}/{town}/{category}-{descriptor}-{shortId}
```

The `-{shortId}` (last 8 chars of `Auction.id`) is **always** present. See the header of
`slug-v2.ts` for why: without it, **55,270 of 240,890 rows (22.9%) collide onto 11,077
shared URLs** — worst offender `/barcelona/barcelona/coche-barcelona` with 629 auctions on
one address. Suffix-on-collision was rejected because it cannot be stable over time (a
re-auction at the same address months later would force an existing URL to change), and we
have no redirects.

## The 13 samples

| # | case | DB address / vehicle | OLD URL | NEW URL |
|---|---|---|---|---|
| 1 | property · plain street + number | `CL PALOMAREJO 6, MENGIBAR` | `/subastas/subasta/hacienda-sevilla-sevilla-cc7d3d8a-7f32-4dbe-bee9-ed31f1b1867d` | `/sevilla/sevilla/vivienda-cl-palomarejo-6-mengibar-f1b1867d` |
| 2 | property · ACCENTED street (á/é/í/ó/ú) | `CALLE JOSE ESCUDERO 72, SITUACIÓN: VIVIENDA SUPERFICIES: - CONSTRUÍDA: VEINTE METROS CUADRADOS - TERRENO: CINCUENTA Y CINCO METROS CUADRADOS, TORRE DE JUAN ABAD` | `/subastas/subasta/hacienda-barcelona-barcelona-73524ae6-a98a-4a5f-9209-45a31b990bbb` | `/barcelona/barcelona/vivienda-calle-jose-escudero-72-situacion-vivienda-1b990bbb` |
| 3 | property · ñ in street and town | `C/ MIÑO S/N, SALVATERRA DE MIÑO` | `/subastas/subasta/judicial-pontevedra-sin-municipio-d33f418b-d7c0-43bd-b8c2-1e061faac452` | `/pontevedra/sin-municipio/terreno-c-mino-s-n-salvaterra-de-mino-1faac452` |
| 4 | property · UNIT-BEARING (planta/puerta) | `calle Eucaliptus, N 18, planta quinta, puerta segunda, ESPLUGUES DE LLOBREGAT` | `/subastas/subasta/judicial-barcelona-sin-municipio-f071fa6a-5b5e-41c7-baf8-332e3b2bbef1` | `/barcelona/sin-municipio/vivienda-calle-eucaliptus-n-18-planta-quinta-puerta-3b2bbef1` |
| 5 | property · very long cadastral address (LENGTH CAP fires) | (same row as #2 — 158 chars in, 48-char descriptor out) | `/subastas/subasta/hacienda-barcelona-barcelona-73524ae6-a98a-4a5f-9209-45a31b990bbb` | `/barcelona/barcelona/vivienda-calle-jose-escudero-72-situacion-vivienda-1b990bbb` |
| 6 | property · MISSING address → town fallback | `—` | `/subastas/subasta/judicial-santa-cruz-de-tenerife-tenerife-5b8e7f83-d087-4d63-8c0f-7068cfbdd500` | `/santa-cruz-de-tenerife/tenerife/vivienda-tenerife-cfbdd500` |
| 7 | property · house-style title, no address | **NO SUCH ROW IN THE CORPUS** (see note 3) | — | — |
| 8 | property · title is BOILERPLATE — must NOT be parsed | `de la entidad especializada designada ACTIVOS CONCURSALES S.L. en cuya página podrán verificarse cuantos datos…` | `/subastas/subasta/judicial-madrid-madrid-4569cb29-984f-4665-87c5-629f2fb94055` | `/madrid/madrid/vivienda-madrid-2fb94055` |
| 9 | vehicle · WITH make/model/year extract | `Ford FIESTA 2004` | `/subastas/subasta/subasta-murcia-sestao-c890e12f-7b5f-413f-938f-d45947ec53da` | `/murcia/sestao/coche-ford-fiesta-2004-47ec53da` |
| 10 | vehicle · NO extract → town fallback (~95% today) | `—` | `/subastas/subasta/judicial-valladolid-valladolid-e56ce9bd-1868-4ea2-b98f-70df40cdf04f` | `/valladolid/valladolid/coche-valladolid-40cdf04f` |
| 11 | **SAME-ADDRESS PAIR (1/2)** — the collision case | `CL TIRSO DE MOLINA, MOLINA DE SEGURA` | `/subastas/subasta/judicial-murcia-murcia-b7e9855a-501a-46f4-8818-45ca32cffa9f` | `/murcia/murcia/vivienda-cl-tirso-de-molina-molina-de-segura-32cffa9f` |
| 12 | **SAME-ADDRESS PAIR (2/2)** — the collision case | `CL TIRSO DE MOLINA, MOLINA DE SEGURA` | `/subastas/subasta/judicial-murcia-murcia-a63de18b-bdd8-4f36-a3ca-c1e45b1dc638` | `/murcia/murcia/vivienda-cl-tirso-de-molina-molina-de-segura-5b1dc638` |
| 13 | edge · municipality NULL → `sin-municipio` | `SITO DE LA CASA DE LA CARIDAD PARCELA 239 DEL POLIGONO 8, TACORONTE` | `/subastas/subasta/judicial-santa-cruz-de-tenerife-sin-municipio-20a81cb8-78ac-454a-81a7-ccff4a9f45b2` | `/santa-cruz-de-tenerife/sin-municipio/finca-sito-de-la-casa-de-la-caridad-parcela-239-del-4a9f45b2` |

Rows 11 and 12 are the whole point: identical province, town, category **and** address —
the bounced version put both on one URL. They now differ only in the trailing 8 chars.

## Measured over the full corpus

| metric | value |
|---|---|
| rows | 240,890 |
| distinct new slugs | **240,890** |
| **duplicate slugs** | **0** |
| malformed slugs | 0 |
| URL length — median / p99 / max | 70 / 93 / 176 chars |
| property rows with a real street descriptor | 213,658 / 232,167 (**92.0 %**) |
| property rows on the town fallback | 18,509 (8.0 %) |
| vehicle rows with a make/model descriptor | 274 / 5,539 (**4.9 %**) |

## Notes / open items for Dennis

1. **Vehicles are 95 % generic today.** `vehicleMake`/`vehicleModel` are populated on only
   274 of 5,539 vehicle rows, so almost every car gets `/{prov}/{town}/coche-{town}-{id}`.
   That is honest, not a bug — and it upgrades for free as Ghost backfills the vehicle
   extract, with **no URL churn**, because the id suffix is already there. If Dennis wants
   pretty car URLs, the ask is a Ghost dispatch, not a slug change.
2. **The old `title` assumption was wrong.** `title` is empty on 219,623 / 240,890 rows
   (91.2 %). `address` is the workhorse. The v2.0 vehicle descriptor read the title and was
   dead code.
3. The title fallback now only fires on the house style `^Subasta … en {street}`; the
   un-anchored version was matching the word "en" inside legal boilerplate and producing
   garbage (row 8 shows what it used to emit). Across the corpus that branch now rescues
   exactly **1** row — kept because it is cheap and correct, not because it earns its keep.
4. ⚠️ **Data-quality flag, NOT a slug bug — but it hurts a geo-first URL.** In rows 1 and 3
   the town in the PATH disagrees with the town in the ADDRESS (`/sevilla/sevilla/…` for an
   address in Mengíbar, Jaén). The v2 shape puts province+town in the URL, so every
   province/municipality mislabel becomes a wrong permanent URL. Recommend a Ghost pass on
   province/municipality accuracy **before** the routing switchover.
5. ⚠️ **44 rows have a `municipality` value that is actually a full address**, producing a
   90-char town segment (worst: `/cantabria/ps-estacion-28-escalera-e-planta-00-puerta-a-39710-medio-cudeyo-cantabria/…`,
   176 chars total). Deliberately NOT truncated here — the town segment must stay identical
   to the town-hub slug, so this is a data fix, not a slug fix.
