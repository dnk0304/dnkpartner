"""
Regression tests for parse_surface_m2 / _spanish_words_to_int — the indefinite
article "un/uno/una" truncation bug (Ghost 2026-08-20).

Bug: BOE registry prose "una superficie de setenta y siete metros y setenta y
seis decimetros cuadrados" was parsed as 1 m2 (the leading article "una" read
as cardinal 1, stopping the number run before the real figure). This collapsed
~299 dwelling surfaceM2 values to 1 / 1.xx. Fix drops a standalone article only
when a genuine number word follows later, while preserving compound units
("noventa y un" = 91) and a bare "un decimetro" (= 1).

boe_scraper drags in playwright via its ..core.* relative imports; these tests
stub those heavy modules so the pure surface helpers run fully offline.

    python -m pytest subastas/scraper/tests/test_surface_m2_article.py -q
"""
import importlib.abc
import importlib.util
import os
import sys
import types

_HERE = os.path.dirname(__file__)
_SCRAPERS = os.path.join(_HERE, "..", "scrapers")


class _Lenient(types.ModuleType):
    """Module whose every attribute access yields a throwaway class/callable."""
    __path__ = []  # act as a package too

    def __getattr__(self, name):
        return type(name, (), {})


class _StubLoader(importlib.abc.Loader):
    def create_module(self, spec):
        return _Lenient(spec.name)

    def exec_module(self, module):
        pass


class _StubFinder(importlib.abc.MetaPathFinder):
    """Stub every 'subastas.scraper.*' submodule EXCEPT boe_scraper itself, so
    boe_scraper's heavy relative imports (playwright-backed ..core.*) resolve to
    lenient placeholders and the pure surface helpers load offline."""
    _PREFIX = "subastas.scraper"

    def find_spec(self, fullname, path=None, target=None):
        if fullname == "subastas.scraper.scrapers.boe_scraper":
            return None
        if fullname == self._PREFIX or fullname == "subastas"                 or fullname.startswith(self._PREFIX + "."):
            return importlib.util.spec_from_loader(
                fullname, _StubLoader(), is_package=True)
        return None


def _load_boe():
    if "boe_surface_under_test" in sys.modules:
        return sys.modules["boe_surface_under_test"]
    sys.meta_path.insert(0, _StubFinder())
    spec = importlib.util.spec_from_file_location(
        "subastas.scraper.scrapers.boe_scraper",
        os.path.join(_SCRAPERS, "boe_scraper.py"),
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules["subastas.scraper.scrapers.boe_scraper"] = mod
    spec.loader.exec_module(mod)
    sys.modules["boe_surface_under_test"] = mod
    return mod


B = _load_boe()


def test_article_una_does_not_truncate_to_one():
    # The exact live-prod pattern that collapsed to 1.76.
    assert B.parse_surface_m2(
        "una superficie de setenta y siete metros y setenta y seis "
        "decimetros cuadrados"
    ) == 77.76


def test_article_una_no_decimetros():
    assert B.parse_surface_m2(
        "con una superficie construida de noventa metros cuadrados"
    ) == 90.0


def test_compound_noventa_y_un_preserved():
    # 'un' here is a genuine units digit (91), must NOT be dropped.
    assert B._spanish_words_to_int("noventa y un") == 91


def test_bare_un_decimetro_preserved():
    assert B.parse_surface_m2(
        "ciento siete metros y un decimetro cuadrado"
    ) == 107.01


def test_ciento_un_preserved():
    assert B._spanish_words_to_int("ciento un") == 101


def test_plain_phrase_unaffected():
    assert B._spanish_words_to_int("cincuenta y dos") == 52
    assert B._spanish_words_to_int("trescientos cuarenta y cinco") == 345
