"""
Wave81 map-categories + bounds — visual verification.

Captures:
  desktop (1440x900) + mobile (390x844) of:
    - landing compact map (LOCAL build) — shows the new rail + map split
    - /subastas?view=map (LOCAL build) — shows the category rail beside the map
    - /subastas?view=map&mapCategory=vehiculos — shows pin set after a category click
    - public-baseline (https://subastasactivas.com) of the same surfaces for diff

Notes:
  - Local build runs against an empty Postgres so API counts may render
    "0" / "…". The structural layout, bounds framing, inset position and
    sidebar wiring are what we verify visually.
  - Public surfaces are captured at the same viewports as a before/after.
"""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"C:\Users\D\.claude\agent-memory\niki\PROJECTS\dnksubastas\artifacts\map-categories")
OUT.mkdir(parents=True, exist_ok=True)

DESKTOP = {"width": 1440, "height": 900}
MOBILE = {"width": 390, "height": 844}

LOCAL = "http://localhost:3005"
PUBLIC = "https://subastasactivas.com"

# (label_suffix, url_path, viewport, scroll_y, settle_seconds)
SHOTS = [
    # LOCAL build — new code
    ("local-landing-desktop", LOCAL, "/", DESKTOP, 0, 4),
    ("local-landing-mobile", LOCAL, "/", MOBILE, 0, 4),
    ("local-mapview-desktop", LOCAL, "/subastas?view=map", DESKTOP, 0, 4),
    ("local-mapview-mobile", LOCAL, "/subastas?view=map", MOBILE, 0, 4),
    ("local-mapview-vehiculos-desktop", LOCAL, "/subastas?view=map&mapCategory=vehiculos", DESKTOP, 0, 4),
    ("local-mapview-vehiculos-mobile", LOCAL, "/subastas?view=map&mapCategory=vehiculos", MOBILE, 0, 4),
    # PUBLIC baseline — for visual diff
    ("public-landing-desktop", PUBLIC, "/", DESKTOP, 0, 5),
    ("public-mapview-desktop", PUBLIC, "/subastas?view=map", DESKTOP, 0, 5),
]


def shoot():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        for label, base, path, viewport, scroll_y, settle in SHOTS:
            url = base + path
            ctx = browser.new_context(
                viewport=viewport,
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/126.0.0.0 Safari/537.36"
                ),
                locale="es-ES",
            )
            page = ctx.new_page()
            print(f"[shoot] {label}  {url}")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60_000)
            except Exception as e:
                print(f"  goto error: {e}")
            time.sleep(settle)
            try:
                if scroll_y:
                    page.evaluate(f"window.scrollTo(0, {scroll_y})")
                    time.sleep(1)
                out_path = OUT / f"{label}.png"
                page.screenshot(path=str(out_path), full_page=False)
                print(f"  -> {out_path}")
            except Exception as e:
                print(f"  shot error: {e}")
            ctx.close()
        browser.close()


if __name__ == "__main__":
    shoot()
