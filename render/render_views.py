"""Rendert die Kameraansichten der 3D-Seite als PNG (Grundlage für das PDF).

Voraussetzung: lokaler Server, z. B. `python -m http.server 8765 --directory hallenfest-3d`.
Aufruf: python render/render_views.py [basis-url]
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
OUT = Path(__file__).parent / "out"
SHOTS = [
    ("overview", ""), ("top", ""), ("top_zones", "&zones=1"), ("party", ""), ("bar", ""),
    ("stehtische", ""), ("eingang", ""), ("grill", ""), ("logistik", ""),
]


def main():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"])
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=1.5)
        page.on("console", lambda m: m.type == "error" and print("console:", m.text))
        for name, extra in SHOTS:
            view = name.replace("_zones", "")
            page.goto(f"{BASE}?render={view}{extra}")
            page.wait_for_function("window.__ready === true", timeout=180_000)
            page.wait_for_timeout(300)
            page.screenshot(path=str(OUT / f"{name}.png"))
            print("ok", name)
        browser.close()


if __name__ == "__main__":
    main()
