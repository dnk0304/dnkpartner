"""Pixel detail-redesign screenshots — wave B2 (2026-06-07).

Captures the pages we can prove on our local box:
  - Landing (/) — shows the NEW lighter cold-green tokens in the chrome.
  - /precios — same tokens applied across the marketing surface.
  - /register — the lighter CTA palette.

For detail pages (which require DB connectivity our local box lacks), we
capture the LIVE site (subastasactivas.com) where Forge B1 already ships
the gate boundary. These show the LOGGED-OUT teaser + FullInfoWall state
as the LIVE site sees it — the redesigned UI lands on top of the same
gate boundary once Ken deploys this branch.

Outputs to niki/PROJECTS/dnksubastas/artifacts/detail-redesign/.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"C:\Users\D\.claude\agent-memory\niki\PROJECTS\dnksubastas\artifacts\detail-redesign")
OUT.mkdir(parents=True, exist_ok=True)

LOCAL_URLS = [
    ("01-local-home", "http://localhost:3005/"),
    ("02-local-precios", "http://localhost:3005/precios"),
    ("03-local-register", "http://localhost:3005/register"),
    ("04-local-subastas-list", "http://localhost:3005/subastas"),
]

LIVE_URLS = [
    ("10-live-home-OLD-tokens", "https://subastasactivas.com/"),
    ("11-live-precios-OLD-tokens", "https://subastasactivas.com/precios"),
    # Live detail (Forge B1 already shipped) — these show the LOGGED-OUT
    # gate boundary (teaser + FullInfoWall) as the LIVE site renders it.
    # The redesigned UI in this branch sits on top of the same boundary.
    ("12-live-detail-logged-out-boe", "https://subastasactivas.com/subastas/subasta/subasta-granada-motril-00302c16-d36c-4bd2-8328-9ac0d679d13d"),
    ("13-live-detail-logged-out-hacienda", "https://subastasactivas.com/subastas/subasta/hacienda-barcelona-barcelona-0000ef65-f28e-4ab4-8193-05f5237cb9d9"),
]

VIEWPORTS = [
    ("desktop", 1440, 900),
    ("mobile", 390, 844),
]


def shoot(urls, p):
    for vp_name, w, h in VIEWPORTS:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        for label, url in urls:
            try:
                page.goto(url, wait_until="networkidle", timeout=45000)
                page.wait_for_timeout(3000)
                out = OUT / f"{label}-{vp_name}-{w}x{h}.png"
                page.screenshot(path=str(out), full_page=True)
                print(f"OK  {out}")
            except Exception as e:
                print(f"ERR {label}/{vp_name}: {e}", file=sys.stderr)
        browser.close()


def main() -> int:
    with sync_playwright() as p:
        shoot(LOCAL_URLS, p)
        shoot(LIVE_URLS, p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
