"""
Street View Service
Generates Google Maps Street View screenshots without API keys.
"""

from pathlib import Path
from typing import Optional
import re
import time
from playwright.sync_api import sync_playwright

from ..config.settings import PROJECT_ROOT, HEADLESS_BROWSER


class StreetViewService:
    def __init__(self):
        self.output_dir = PROJECT_ROOT / "public" / "streetview"
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def build_streetview_url(self, latitude: float, longitude: float) -> str:
        return (
            "https://www.google.com/maps/@?api=1&map_action=pano"
            f"&viewpoint={latitude},{longitude}"
        )

    def build_streetview_url_for_address(self, address: str) -> str:
        # Let Google Maps resolve the address to a pano
        safe_address = re.sub(r"\s+", " ", address.strip())
        return (
            "https://www.google.com/maps/search/?api=1&query="
            f"{safe_address}&layer=c"
        )

    def build_map_url(self, latitude: float, longitude: float) -> str:
        return f"https://www.google.com/maps?q={latitude},{longitude}"

    def build_directions_url(self, latitude: float, longitude: float) -> str:
        return f"https://www.google.com/maps/dir/?api=1&destination={latitude},{longitude}"

    def build_map_url_for_address(self, address: str) -> str:
        safe_address = re.sub(r"\s+", " ", address.strip())
        return f"https://www.google.com/maps?q={safe_address}"

    def build_directions_url_for_address(self, address: str) -> str:
        safe_address = re.sub(r"\s+", " ", address.strip())
        return f"https://www.google.com/maps/dir/?api=1&destination={safe_address}"

    def get_public_url(self, boe_id: str) -> str:
        safe = re.sub(r'[^a-zA-Z0-9_-]+', '_', boe_id)
        return f"/streetview/{safe}.jpg"

    def capture_streetview(self, boe_id: str, latitude: float, longitude: float) -> Optional[str]:
        if not latitude or not longitude:
            return None

        safe = re.sub(r'[^a-zA-Z0-9_-]+', '_', boe_id)
        output_path = self.output_dir / f"{safe}.jpg"
        if output_path.exists():
            return self.get_public_url(boe_id)

        url = self.build_streetview_url(latitude, longitude)
        return self._capture_url(boe_id, url)

    def capture_streetview_by_address(self, boe_id: str, address: str) -> Optional[str]:
        if not address:
            return None

        safe = re.sub(r'[^a-zA-Z0-9_-]+', '_', boe_id)
        output_path = self.output_dir / f"{safe}.jpg"
        if output_path.exists():
            return self.get_public_url(boe_id)

        url = self.build_streetview_url_for_address(address)
        return self._capture_url(boe_id, url)

    def _capture_url(self, boe_id: str, url: str) -> Optional[str]:
        safe = re.sub(r'[^a-zA-Z0-9_-]+', '_', boe_id)
        output_path = self.output_dir / f"{safe}.jpg"

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=HEADLESS_BROWSER,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                ],
            )
            context = browser.new_context(
                viewport={"width": 1200, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                locale="es-ES",
                timezone_id="Europe/Madrid",
            )
            page = context.new_page()

            page.goto(url, wait_until="networkidle", timeout=60000)
            time.sleep(5)

            try:
                page.keyboard.press("Escape")
                time.sleep(1)
            except Exception:
                pass

            page.screenshot(path=str(output_path), type="jpeg", quality=80)

            context.close()
            browser.close()

        return self.get_public_url(boe_id)
