"""Wave86 banner before/after screenshot."""
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(r"C:\Users\D\.claude\agent-memory\niki\PROJECTS\dnksubastas\artifacts\banner-vivienda-images")
HTML = OUT / "banner-preview.html"

def main() -> int:
    with sync_playwright() as p:
        for vp_name, w, h in (("desktop", 1280, 900), ("mobile", 390, 844)):
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width": w, "height": h})
            page = ctx.new_page()
            page.goto(HTML.as_uri(), wait_until="domcontentloaded")
            page.wait_for_timeout(400)
            out = OUT / f"banner-before-after-{vp_name}.png"
            page.screenshot(path=str(out), full_page=True)
            print(out)
            browser.close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
