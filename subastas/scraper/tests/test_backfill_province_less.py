"""
Unit tests for the province-less backfill + ingestion derivation logic.

Run with (from subastas/):
    python -m pytest scraper/tests/test_backfill_province_less.py -q

Covers the shared resolve_province_less() decision (used by BOTH the backfill and
the ingestion guard): fill ONLY when address / municipality / bien* resolve to a
REAL Spanish province, and NEVER guess otherwise. Ken's prod dry-run proved the
recoverable signal lives in `address` (93% populated) and `municipality`, not the
bien*/postal columns, so the address parser is the primary path under test.
"""

from scraper.backfill_province_less import classify_province_less, JUNK_PROVINCE_SQL, SOURCE_KEYS
from scraper.config.municipality_province import (
    derive_province_from_address, resolve_province_less, municipality_to_province,
    court_province_hint, _INE_UNAMBIGUOUS, _AMBIGUOUS_TOWNS, _AMBIGUOUS_CANDIDATES,
)


# ── whole-string parse recovery (2026-07-28): accents / case / punctuation /
#    embedded-town / multi-word — the misses v2..v4 left behind ──────────────

def test_accented_hyphenated_town_now_matches():
    # "Vélez-Málaga" — accent + hyphen; must match the gazetteer key.
    assert derive_province_from_address("Calle Mayor 3, Vélez-Málaga") == ("Málaga", "address-town")


def test_lowercase_accented_town_matches():
    # Unambiguous lowercase + accented town (Sabiñánigo -> Huesca). NB: bare
    # "Alcúdia" is now CORRECTLY ambiguous (Mallorca's Alcúdia vs Valencia's
    # l'Alcúdia collapse to the same article-stripped key) -> see the compound
    # ambiguity test below; it must NOT fill from the bare name.
    assert derive_province_from_address("carrer sant joan, sabiñánigo") == ("Huesca", "address-town")


def test_town_embedded_without_comma_delimiter():
    # No comma separating street from town — old parser missed this entirely.
    assert derive_province_from_address("Calle Mayor 5 Torrevieja") == ("Alicante", "address-town")


def test_multiword_town_matches():
    assert derive_province_from_address("Urb Los Pinos, San Lorenzo de El Escorial") == ("Madrid", "address-town")


def test_newly_recovered_small_town_midstring():
    assert derive_province_from_address("Plaza España s/n Nules") == ("Castellón", "address-town")


# ── FALSE-POSITIVE GUARDS — a street named after a place must NOT misfill ─────

def test_street_named_after_province_does_not_misfill():
    # "Avenida de Alicante 20" is a STREET named after Alicante, with NO real
    # town in the string -> must stay UNKNOWABLE, never wrongly filled Alicante.
    assert derive_province_from_address("Avenida de Alicante 20") == (None, None)


def test_street_town_ignored_when_real_town_trails():
    # "Calle Sevilla" is a street; the real town Madrid trails and must win.
    prov, _ = derive_province_from_address("Calle Sevilla 3, Madrid")
    assert prov == "Madrid"
    # symmetric: street "Madrid", real town "Sevilla".
    prov2, _ = derive_province_from_address("Calle Madrid 2, Sevilla")
    assert prov2 == "Sevilla"


def test_longest_match_beats_street_province_word():
    # A multi-word trailing town beats a single province word used in a street.
    assert derive_province_from_address("Avenida de Barcelona, Torrejón de Ardoz") == ("Madrid", "address-town")


def test_rural_no_town_stays_unknowable():
    assert derive_province_from_address("Finca El Prado, Paraje Los Llanos") == (None, None)
    assert derive_province_from_address("Polígono 3, Parcela 45") == (None, None)


def _assert_true_or_null(address, true_province, wrong_province):
    """The v6 correctness contract for a compound town: it resolves to its TRUE
    province OR stays UNKNOWABLE — NEVER to the wrong (sub-token) province."""
    prov, _ = derive_province_from_address(address)
    assert prov != wrong_province, f"{address} WRONGLY filled {prov}"
    assert prov in (true_province, None), f"{address} -> {prov}, expected {true_province} or None"


# ── v6: co-official compound towns must resolve TRUE or NULL, never WRONG ─────

def test_compound_pobla_de_vallbona_valencia():
    assert derive_province_from_address("La Pobla de Vallbona") == ("Valencia", "address-town")
    _assert_true_or_null("Av del Riu 3, La Pobla de Vallbona", "Valencia", "Barcelona")


def test_compound_santa_cristina_daro_girona():
    assert derive_province_from_address("Santa Cristina d'Aro") == ("Girona", "address-town")
    _assert_true_or_null("C/ del Mar 5, Santa Cristina d'Aro", "Girona", "Badajoz")


def test_compound_mora_debre_tarragona():
    assert derive_province_from_address("Móra d'Ebre") == ("Tarragona", "address-town")


def test_compound_polinya_del_xuquer_valencia():
    # co-official "del Xúquer" vs Castilian "de Júcar" — connector-stripped match.
    assert derive_province_from_address("Polinyà del Xúquer") == ("Valencia", "address-town")


def test_compound_mora_la_nova_true_or_null_never_toledo():
    # Not in the co-official set -> must be Tarragona or NULL, never Toledo.
    _assert_true_or_null("Móra la Nova", "Tarragona", "Toledo")


def test_truncated_compound_never_subtoken_misfills():
    # "Sotillo de la Adrad" (source-truncated) must NOT fill Segovia via "Sotillo".
    prov, _ = derive_province_from_address("Sotillo de la Adrad")
    assert prov in ("Ávila", None) and prov != "Segovia"


def test_subtoken_guard_no_hijack_in_compound_context():
    # A bare hijacking sub-token in a connector (compound) context must never fill
    # its WRONG province.
    assert derive_province_from_address("Pda de Vallbona") != ("Barcelona", "address-town")
    assert derive_province_from_address("Zona de Cristina") != ("Badajoz", "address-town")


def test_legit_standalone_subtoken_still_fills():
    # A genuine standalone town that happens to be a compound component still
    # fills when it is NOT in a connector (compound) context.
    assert derive_province_from_address("Calle Mayor 2, Vallbona") == ("Barcelona", "address-town")


def test_no_regression_street_name_towns():
    # The street-name guard (v5) must still hold after the compound rework.
    assert derive_province_from_address("Calle Málaga 3, Granada")[0] == "Granada"
    assert derive_province_from_address("Avda de Cádiz, La Carlota")[0] == "Córdoba"
    assert derive_province_from_address("Avenida de Alicante 20") == (None, None)


def _true_or_null(address, true_province, wrong_province):
    prov, _ = derive_province_from_address(address)
    assert prov != wrong_province, f"{address} WRONGLY filled {prov}"
    assert prov in (true_province, None), f"{address} -> {prov}, expected {true_province} or None"


# ── v7: the 6 prod probe_v6 misfills — each TRUE or NULL, never wrong ─────────
# Root class: the real town fails to match cleanly, so a stray token (road name,
# surname, smaller town, paraje) hijacks a different province. The conservative
# single-unambiguous-candidate rule NULLs (or correctly resolves) every one.

def test_probe_santa_cristina_a_platja_daro():
    # "Carretera de Santa Cristina a Platja d'Aro" — route splits the compound;
    # only "Cristina"(Badajoz) matches -> must NOT fill Badajoz.
    _true_or_null("Carretera de Santa Cristina a Platja d'Aro GE-662 nº106", "Girona", "Badajoz")


def test_probe_mora_la_nova_tortosa_bruc():
    # "C. TORTOSA Y BRUC, MORA LA NOVA" — "Bruc"(Barcelona) is an "y"-chained
    # street name; must resolve Tarragona (Móra la Nova) or NULL, never Barcelona.
    _true_or_null("C. TORTOSA Y BRUC, MORA LA NOVA", "Tarragona", "Barcelona")


def test_probe_mora_la_nova_guimera():
    _true_or_null("C. ANGEL GUIMERA Nº7, MORA LA NOVA", "Tarragona", "Lleida")


def test_probe_xilxes_moros_linderos():
    # "…XILXES … JOSE CASABO MOROS" — "Moros"(Zaragoza) is a lindero surname.
    _true_or_null("CL MAR,4; XILXES Izquierda, JOSE CASABO MOROS", "Castellón", "Zaragoza")


def test_probe_campos_paramo_paraje():
    # "…DEL PARAMO, CAMPOS PARAI" — "Campos"(Mallorca) inside a paraje.
    _true_or_null("LG PUENTECILLO DEL PARAMO, CAMPOS PARAI", "Lugo", "Illes Balears")


def test_probe_san_roque_las_mesas():
    # "URB.SAN ROQUE CLUB, LAS MESAS DEL DIENTE" — "Las Mesas"(Cuenca) is a paraje
    # prefix; San Roque is inside an urbanización name.
    _true_or_null("URB.SAN ROQUE CLUB, LAS MESAS DEL DIENTE", "Cádiz", "Cuenca")


def test_multi_candidate_hijack_nulled():
    # Two towns in different provinces, neither corroborated -> NULL, never a guess.
    prov, _ = derive_province_from_address("Calle Cuenca, Girona")
    # both are provinces/towns -> competing -> must not silently pick one wrongly
    assert prov in ("Girona", None)  # Cuenca is a street here; Girona trails


def test_ambiguous_town_midstring_still_needs_tiebreaker():
    # Ambiguous town embedded in the string: bare -> unknowable; with a matching
    # court -> resolves (the whole-string scan feeds the tiebreaker the candidates).
    assert derive_province_from_address("Calle Real 1 Arroyomolinos") == (None, None)
    assert resolve_province_less(
        address="Calle Real 1 Arroyomolinos",
        court_name="Juzgado N.º 2 de Cáceres",
    ) == ("Cáceres", "court-disambig")


# ── COURT / SOURCE tiebreaker for ambiguous towns (deep pass) ─────────────────

def test_court_hint_parses_province_from_juzgado():
    assert court_province_hint("Juzgado de Primera Instancia N.º 2 de Cáceres") == "Cáceres"
    assert court_province_hint("Juzgado de lo Mercantil N.º 1 de Alicante") == "Alicante"
    # court city that is a small town resolves to its province
    assert court_province_hint("Juzgado de 1ª Instancia e Instrucción N.º 1 de Nules") == "Castellón"
    # multi-"de" city name
    assert court_province_hint("Juzgado de lo Mercantil N.º 1 de Jerez de la Frontera") == "Cádiz"
    assert court_province_hint("") is None
    assert court_province_hint(None) is None


def test_ambiguous_resolves_with_matching_court_province():
    # Arroyomolinos = {Madrid, Cáceres}; the court province picks the right one.
    assert _AMBIGUOUS_CANDIDATES["arroyomolinos"] == frozenset({"Madrid", "Cáceres"})
    assert resolve_province_less(
        address="Calle Real 1, Arroyomolinos",
        court_name="Juzgado de 1ª Instancia N.º 2 de Cáceres",
    ) == ("Cáceres", "court-disambig")
    assert resolve_province_less(
        address="Calle Real 1, Arroyomolinos",
        court_name="Juzgado N.º 5 de Madrid",
    ) == ("Madrid", "court-disambig")
    # ambiguous MUNICIPALITY field + court also resolves
    assert resolve_province_less(
        municipality="Cieza", court_name="Juzgado N.º 1 de Murcia",
    ) == ("Murcia", "court-disambig")


def test_court_not_among_candidates_never_overrides():
    # Court points to Sevilla, which is NOT a candidate of Arroyomolinos
    # (Madrid/Cáceres) -> flagged as a conflict, row left UNKNOWABLE (no wrong fill).
    assert resolve_province_less(
        address="Calle Real 1, Arroyomolinos",
        court_name="Juzgado N.º 1 de Sevilla",
    ) == (None, "court-conflict")


def test_ambiguous_without_court_signal_stays_unknowable():
    assert resolve_province_less(address="Calle Real 1, Arroyomolinos") == (None, None)
    assert resolve_province_less(address="Calle Real 1, Arroyomolinos", court_name="") == (None, None)
    # a court whose city/province cannot be parsed gives no hint -> unknowable
    assert resolve_province_less(
        address="Calle Real 1, Arroyomolinos", court_name="Notaría número 3",
    ) == (None, None)


def test_court_never_overrides_a_confident_address():
    # An unambiguous address must NOT be second-guessed by a court in another province.
    assert resolve_province_less(
        address="C/ X, Torrevieja", court_name="Juzgado N.º 1 de Madrid",
    ) == ("Alicante", "address-town")


# ── FULL INE register loaded (2026-07-28) ────────────────────────────────────

def test_full_ine_register_loaded():
    # The complete register must be present (thousands of towns), not a partial list.
    assert len(_INE_UNAMBIGUOUS) > 7500
    assert len(_AMBIGUOUS_TOWNS) >= 1


def test_newly_covered_small_towns():
    # Small towns the old partial map missed now resolve (unambiguous single-province).
    assert municipality_to_province("Nules") == "Castellón"
    assert municipality_to_province("Olivenza") == "Badajoz"
    assert derive_province_from_address("Calle Mayor 2, 12520 Nules")[0] == "Castellón"
    assert derive_province_from_address("Plaza de España, Olivenza")[0] == "Badajoz"


# ── DUPLICATE / AMBIGUOUS town names — correctness > coverage ─────────────────

def test_ambiguous_town_unknowable_without_disambiguator():
    # Arroyomolinos exists in Madrid AND Cáceres; Cieza in Murcia AND Cantabria.
    # From the town name alone we must NOT guess.
    assert municipality_to_province("Arroyomolinos") is None
    assert municipality_to_province("Cieza") is None
    assert derive_province_from_address("Calle Real 1, Arroyomolinos") == (None, None)
    assert resolve_province_less(address="Av X, Cieza") == (None, None)


def test_ambiguous_town_resolves_with_postal():
    # A postal-code prefix disambiguates (higher-priority signal).
    assert derive_province_from_address("Calle Real 1, 28939 Arroyomolinos") == ("Madrid", "address-postal")
    assert derive_province_from_address("Av X, 30530 Cieza") == ("Murcia", "address-postal")


def test_ambiguous_town_resolves_with_explicit_province():
    # An explicit province name in the address disambiguates.
    assert derive_province_from_address("Calle Real 1, Arroyomolinos, Cáceres") == ("Cáceres", "address-province")
    assert derive_province_from_address("Calle Real 1, Arroyomolinos (Madrid)") == ("Madrid", "address-province")


# ── address -> province extraction (the primary path) ────────────────────────

def test_address_trailing_town():
    # Coordinator's exact example — trailing town wins over the street.
    assert derive_province_from_address("avinguda de alicante, 20, Torrevieja") == ("Alicante", "address-town")


def test_address_postal_code_anywhere():
    assert derive_province_from_address("Calle Sevilla 3, 28013 Madrid") == ("Madrid", "address-postal")


def test_address_explicit_province_name():
    assert derive_province_from_address("Av. de Andalucía, Sevilla") == ("Sevilla", "address-province")


def test_address_province_in_parentheses():
    # Town + its province both present and agreeing -> Alicante (method is an
    # internal detail; the trailing town may satisfy the single-candidate rule first).
    assert derive_province_from_address("C/ Mayor 5, Torrevieja (Alicante)")[0] == "Alicante"


def test_address_ambiguous_street_name_does_not_win():
    # "Sevilla" is a STREET here; the trailing town "Madrid" must win (right-to-
    # left scan) — the derivation must not be fooled by a province word in a street.
    prov, _ = derive_province_from_address("Calle Sevilla 3, Madrid")
    assert prov == "Madrid"


# ── island provinces (Las Palmas / Santa Cruz de Tenerife) ───────────────────

def test_island_las_palmas_by_town():
    prov, _ = derive_province_from_address("35100 Maspalomas, Las Palmas de Gran Canaria")
    assert prov == "Las Palmas"


def test_island_tenerife_by_postal():
    prov, _ = derive_province_from_address("Calle del Sol, 38400 Puerto de la Cruz")
    assert prov == "Santa Cruz de Tenerife"


def test_multiword_province_a_coruna():
    prov, _ = derive_province_from_address("Rúa do Vilar, Santiago de Compostela, A Coruña")
    assert prov == "A Coruña"


# ── UNKNOWABLE — never guess ─────────────────────────────────────────────────

def test_address_unresolvable_is_unknowable():
    assert derive_province_from_address("Calle Falsa 123") == (None, None)


def test_empty_address_is_unknowable():
    assert derive_province_from_address("") == (None, None)
    assert derive_province_from_address(None) == (None, None)


# ── resolve_province_less source priority (address -> municipality -> bien*) ──

def test_resolve_prefers_address_over_municipality():
    prov, src = resolve_province_less(address="C/ X, 41013 Sevilla", municipality="Madrid")
    assert (prov, src) == ("Sevilla", "address-postal")


def test_resolve_falls_back_to_municipality():
    prov, src = resolve_province_less(address="Calle Falsa 1", municipality="Avilés")
    assert (prov, src) == ("Asturias", "municipality")


def test_resolve_falls_back_to_bien_provincia():
    prov, src = resolve_province_less(address=None, municipality=None, bien_provincia="Barcelona")
    assert (prov, src) == ("Barcelona", "bienProvincia")


def test_resolve_all_absent_is_unknowable():
    assert resolve_province_less() == (None, None)


def test_court_province_is_never_used_to_fill():
    # A real-looking court province must NOT fill — it's the junk we're replacing.
    assert resolve_province_less(address=None, court_province="Madrid") == (None, None)


# ── classify_province_less wraps resolve_province_less ────────────────────────

def test_classify_matches_resolve():
    assert classify_province_less(address="avinguda de alicante, 20, Torrevieja") == ("Alicante", "address-town")


def test_source_keys_cover_all_reported_sources():
    assert set(SOURCE_KEYS) == {
        "address-postal", "address-province", "address-town",
        "municipality", "court-disambig",
        "bienProvincia", "postalCode", "bienLocalidad",
    }


# ── junk-province predicate ──────────────────────────────────────────────────

def test_junk_predicate_targets_inscope_and_covers_sentinels():
    sql = JUNK_PROVINCE_SQL.lower()
    assert '"inscope" = true' in sql
    assert "province is null" in sql
    assert "length(trim(province)) <= 1" in sql
    for sentinel in ["unknown", "desconocida", "mapa de la zona",
                     "mapa del municipio", "null", "undefined"]:
        assert sentinel in sql, sentinel
