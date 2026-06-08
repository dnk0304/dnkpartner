"""Pixel — hero-slogan-sources verification shots (desktop + mobile).

Captures the new HERO (slogan H1 + source-portals bullet grid) against the
LOCAL prod build on :3137 with HEADED Chromium, per task gate.
"""
from playwright.sync_api import sync_playwright
import os

OUT_DIR = r"C:\Users\D\.claude\agent-memory\niki\PROJECTS\dnksubastas\artifacts\hero-slogan"
os.makedirs(OUT_DIR, exist_ok=True)
URL = "http://localhost:3137/"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)

    # Desktop
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(3500)
    d_full = os.path.join(OUT_DIR, "hero-desktop.png")
    page.screenshot(path=d_full, full_page=False)
    print("wrote", d_full)
    # Tight crop of just the hero section
    hero = page.locator("section[aria-labelledby='hero-headline']")
    hero.screenshot(path=os.path.join(OUT_DIR, "hero-desktop-crop.png"))
    print("wrote hero-desktop-crop.png")
    ctx.close()

    # Mobile (iPhone-ish 390x844)
    ctx2 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, device_scale_factor=2)
    page2 = ctx2.new_page()
    page2.goto(URL, wait_until="networkidle", timeout=60000)
    page2.wait_for_timeout(3500)
    m_full = os.path.join(OUT_DIR, "hero-mobile.png")
    page2.screenshot(path=m_full, full_page=False)
    print("wrote", m_full)
    hero2 = page2.locator("section[aria-labelledby='hero-headline']")
    hero2.screenshot(path=os.path.join(OUT_DIR, "hero-mobile-crop.png"))
    print("wrote hero-mobile-crop.png")
    ctx2.close()

    browser.close()
print("DONE")
