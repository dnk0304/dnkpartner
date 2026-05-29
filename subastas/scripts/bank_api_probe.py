#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bank API Probe
Opens bank portals and logs JSON/XHR endpoints to help reverse engineer APIs.
"""

import sys
import time
import io
import json
import os
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright


if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

BANK_SITES = [
    {
        "name": "servihabitat",
        "url": "https://www.servihabitat.com",
        "listing_urls": [
            "https://www.servihabitat.com/es/venta/vivienda/",
            "https://www.servihabitat.com/es/land/sinposesion",
        ],
    },
    {
        "name": "haya",
        "url": "https://www.haya.es",
        "listing_urls": [
            "https://www.haya.es/es/venta-viviendas",
            "https://www.haya.es/es/venta",
        ],
    },
    {
        "name": "altamira",
        "url": "https://www.altamirainmuebles.com",
        "listing_urls": [
            "https://www.altamirainmuebles.com/viviendas.html",
            "https://www.altamirainmuebles.com/inmuebles.html",
        ],
    },
    {
        "name": "solvia",
        "url": "https://www.solvia.es",
        "listing_urls": [
            "https://www.solvia.es/es/comprar/viviendas",
            "https://www.solvia.es/es/comprar/casa",
        ],
    },
    {
        "name": "anticipa",
        "url": "https://www.anticipa.es",
        "listing_urls": [
            "https://www.anticipa.es/comprar",
            "https://www.anticipa.es/viviendas",
        ],
    },
    {
        "name": "aliseda",
        "url": "https://www.alisedainmobiliaria.com",
        "listing_urls": [
            "https://www.alisedainmobiliaria.com/comprar-viviendas",
            "https://www.alisedainmobiliaria.com/comprar-viviendas/comunidad-de-madrid/madrid",
        ],
    },
]


def log_line(path: Path, payload: dict):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")


def is_api_request(url: str, resource_type: str) -> bool:
    if resource_type in {"xhr", "fetch"}:
        return True
    return "/api" in url or "/graphql" in url


def try_interactions(page, log_path: Path, bank_name: str):
    def safe_click(selector: str):
        try:
            locator = page.locator(selector)
            if locator.count() > 0:
                locator.first.click()
                time.sleep(2)
        except Exception:
            return

    def safe_type(selector: str, value: str):
        try:
            locator = page.locator(selector)
            if locator.count() > 0:
                locator.first.fill(value)
                time.sleep(1)
                locator.first.press("Enter")
                time.sleep(2)
        except Exception:
            return

    # Cookie banners
    safe_click('button:has-text("Aceptar")')
    safe_click('button:has-text("Aceptar todo")')
    safe_click('button:has-text("Aceptar todas")')

    # Common search inputs
    safe_type('input[placeholder*="Buscar" i]', "Madrid")
    safe_type('input[type="search"]', "Madrid")
    safe_type('input[name*="search" i]', "Madrid")
    safe_type('input[name*="q" i]', "Madrid")

    # Common search buttons
    safe_click('button:has-text("Buscar")')
    safe_click('input[type="submit"]')

    # Scroll to trigger lazy loads
    page.mouse.wheel(0, 1600)
    time.sleep(2)


def run_probe(output_dir: Path, headless: bool = False):
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = output_dir / f"bank_api_probe_{timestamp}.log"

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
            ],
        )

        context = browser.new_context(
            viewport={"width": 1366, "height": 768},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="es-ES",
            timezone_id="Europe/Madrid",
        )

        page = context.new_page()
        page.set_default_timeout(10000)

        def handle_request(req):
            if is_api_request(req.url, req.resource_type):
                log_line(log_path, {
                    "type": "request",
                    "ts": datetime.now().isoformat(),
                    "url": req.url,
                    "method": req.method,
                    "resource_type": req.resource_type,
                })

        def handle_response(res):
            url = res.url
            ct = res.headers.get("content-type", "")
            if "application/json" in ct or is_api_request(url, res.request.resource_type):
                log_line(log_path, {
                    "type": "response",
                    "ts": datetime.now().isoformat(),
                    "url": url,
                    "status": res.status,
                    "content_type": ct,
                })

        page.on("request", handle_request)
        page.on("response", handle_response)

        skip_banks = {
            name.strip().lower()
            for name in os.getenv("SKIP_BANKS", "").split(",")
            if name.strip()
        }

        for bank in BANK_SITES:
            name = bank["name"]
            url = bank["url"]
            if name.lower() in skip_banks:
                print(f"⏭️  Skipping {name} (SKIP_BANKS)")
                continue
            print(f"🔎 Probing {name}: {url}")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                time.sleep(4)
                page.mouse.wheel(0, 1200)
                time.sleep(2)
                try_interactions(page, log_path, name)

                for listing_url in bank.get("listing_urls", []):
                    try:
                        print(f"➡️  {name} listing: {listing_url}")
                        page.goto(listing_url, wait_until="domcontentloaded", timeout=30000)
                        time.sleep(4)
                        try_interactions(page, log_path, name)
                    except Exception as e:
                        log_line(log_path, {
                            "type": "error",
                            "ts": datetime.now().isoformat(),
                            "bank": name,
                            "url": listing_url,
                            "error": str(e),
                        })
            except Exception as e:
                log_line(log_path, {
                    "type": "error",
                    "ts": datetime.now().isoformat(),
                    "bank": name,
                    "error": str(e),
                })

        context.close()
        browser.close()

    print(f"✅ API probe log saved to: {log_path}")


if __name__ == "__main__":
    headless = "--headless" in sys.argv
    run_probe(Path("scraper/logs"), headless=headless)
