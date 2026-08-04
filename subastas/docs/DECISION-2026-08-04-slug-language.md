# DECISION — URL slug language: CO-OFFICIAL canonical, Castilian as permanent 301 alias

**Decided by:** Dennis · **Date:** 2026-08-04 · **Recommended by:** Ken · **Implemented by:** Forge
**Status:** FINAL. Recorded here so it is not re-litigated into a re-slug later (URL-SPEC-v3 §"slug language").

---

## The decision

1. **Canonical slug = the CO-OFFICIAL / official INE denomination**, everywhere — province and
   municipality alike. `girona`, `lleida`, `a-coruna`, `gipuzkoa`, `bizkaia`, `araba-alava`,
   `ourense`, `elx`, `valencia`(València), `alacant`, `vitoria-gasteiz`.
2. **Every Castilian form is a PERMANENT 301 alias** to the canonical. `gerona` → `girona`,
   `la-coruna` → `a-coruna`, `lerida` → `lleida`, `elche` → `elx`, and so on.
   **Both spellings always resolve. Neither ever 404s.**
3. **On-page display and metadata carry the official denomination** regardless of URL.
4. One canonical slug per place, **chosen once, never churned.**

## Why this, and why it was not the original recommendation

Ken's first recommendation was **Castilian** canonical, on a pure search-volume argument: people type
"elche subastas". That recommendation was made before anyone measured what production already served.

**Measured on 2026-08-04 against the live site (`subastasactivas.com`, via the origin container):**

```
/subastas/girona     200        /subastas/gerona     301
/subastas/a-coruna   200        /subastas/la-coruna  301
```

`src/lib/seo/slugs.ts` → `PROVINCE_ALIAS_TO_CANONICAL` already maps **Castilian → co-official**, and
those co-official URLs are **the ones already indexed**. The Castilian forms were already the
aliases. Adopting Castilian canonical would therefore have meant **inverting every already-indexed
province canonical** — moving the province/town hub pages that are our strongest crawl surface, and
the exact surface the two-segment `/subastas/{province}/{town}/` shape was chosen to protect.

**Dennis's ruling: keep where it already ranks.** The SEO argument that motivated "Castilian" is
outweighed by not moving indexed pages, and the alias layer means the Castilian searcher still lands
correctly — with a 301 instead of a direct hit. In Spain the Castilian exonym can also read as
politically loaded to local readers; the co-official form is the legally correct denomination.

**Cost of this decision: zero.** No canonical slug changes. INE's primary denomination *is* the
co-official form, so the CP→municipality table and the gazetteer resolver already emit exactly these
names. Nothing is re-slugged. Nothing that is indexed moves.

## Correction to the spec that this decision depends on

URL-SPEC-v3 §5 said *"still no redirect machinery"*. **That was false as written** and is corrected
in the spec: a **province-level 301 alias layer already exists and is live**. The accurate, narrower
statement is that there is **no redirect machinery for auction-DETAIL URLs** — which is where the
one-way, mint-once discipline genuinely applies.

## Known limitation — Castilian exonyms INE no longer carries

Aliases are generated **from the official INE register**, so a Castilian form is only aliasable when
INE still lists it as an alternative denomination for that municipality. INE has dropped a number of
Castilian exonyms entirely (`Gerona`, `Lérida`, `Vitoria`, `Mahón`, `Calpe`, `Villarreal`,
`Crevillente`, `Almazora`, `Torrente`, `Puzol`), so those **cannot be aliased from the gazetteer**.

At **province** level this is already solved: `PROVINCE_ALIAS_TO_CANONICAL` carries them explicitly.
At **municipality** level it remains open, and is deliberately **not** fixed with a hand-written list
— Ghost declined to hand-build one and Ken endorsed that call: a hand list *looks* like coverage and
*behaves* like guesswork. Closing it properly needs an official former-denomination source
(INE historical register / BOE renaming decrees). Tracked, not blocking.

## Where this is implemented

| concern | location |
|---|---|
| province alias → canonical (301) | `src/lib/seo/slugs.ts` → `PROVINCE_ALIAS_TO_CANONICAL` |
| municipality canonical name | `src/lib/geo/municipality-gazetteer.ts` (INE official denomination) |
| municipality alias → canonical (301) | `src/data/municipality-aliases.json` (generated) |
| regeneration | `npx tsx scripts/build-municipality-aliases.ts` |
