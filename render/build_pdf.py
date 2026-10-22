"""Baut hallenplan-3d.pdf aus den gerenderten Ansichten (render/out/*.png).

Aufruf: python render/build_pdf.py [link-zur-3d-seite]
"""
import sys
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

ROOT = Path(__file__).parent
OUT = ROOT / "out"
PDF = ROOT.parent / "hallenplan-3d.pdf"
LINK = sys.argv[1] if len(sys.argv) > 1 else "https://kaisrjakob.github.io/hallenfest-3d/"

PAGES = [
    ("overview", "Übersicht", "Gesamte Halle von Südosten: Logistikbereich (Regale), Party-Bereich, Einbau mit Büros/WC, Grill-Pavillon draußen."),
    ("top", "Draufsicht", "Lageplan von oben mit Beschriftung."),
    ("top_zones", "Draufsicht mit Zonen", "Rot = abgesperrter Logistikbereich, Grün = Party-Bereich (Farben wie im Originalplan)."),
    ("party", "Party-Bereich", "Stehtische, Steh-Bretter am Regal, Bierbank-Garnituren, Bar und Musik."),
    ("bar", "Bar & Musik", "Bar mit Zapfanlage, dahinter Getränkewagen (Kühlanhänger); DJ-Tisch mit Lautsprechern."),
    ("stehtische", "Stehtische & Steh-Bretter", "5 Stehtische mit Husse; Steh-Bretter in das Palettenregal eingehängt (ca. 1,10 m) zum Aufstützen und Abstellen."),
    ("max", "Gehege Max", "Hund Max mit Gitter, Napf und Futterspender – im 3D-Modell live animiert und per Kurbel/Button fütterbar."),
    ("eingang", "Blick vom Ein-/Ausgang #1", "Augenhöhe (1,65 m) direkt hinter der Tür Richtung Party-Bereich."),
    ("grill", "Grill-Pavillon (draußen)", "Faltpavillon vor Ein-/Ausgang #1 mit Gasgrill, Schwenkgrill und Arbeitstisch."),
    ("logistik", "Abgesperrter Logistikbereich", "Palettenregale mit eingelagerten Kartons; Absperrkette rot/weiß zum Party-Bereich."),
]

NOTES = [
    "Maßstab aus dem 2D-Plan abgeleitet: 1 Block „Mondi Pap Palette“ = 3 Europaletten nebeneinander = 2,4 m.",
    "Daraus ergibt sich eine Hallengröße von ca. 20,4 × 25,6 m. Alle Maße sind Schätzungen, nicht vermessen.",
    "Regalhöhe (ca. 6,2 m), Ebenen und Beladung sind angenommen. Hallenwände sind auf 3,4 m angeschnitten, Dach ausgeblendet.",
    "Einbau (Büros, Küche, WC, Treppenhaus, Gehege Max) eingeschossig dargestellt; Möblierung und Innentüren sind angenommen.",
    "„Palettenblock?“ aus dem Plan als hochkant gestellte Paletten dargestellt – Fragezeichen aus der Vorlage übernommen.",
    "Absperrkette: Verlauf entlang der Grenze rot/grün aus dem Plan; genaue Pfostenpositionen sind angenommen.",
    "Position der 5 Stehtische innerhalb des ovalen Bereichs frei verteilt.",
    "Gehege Max: Wand zum Gang als Gitter (1,2 m) mit Futterspender angenommen, damit Besucher Max sehen und füttern können.",
]

W, H = landscape(A4)
M = 28
DARK = HexColor("#1e2329")
ACCENT = HexColor("#f2b705")
GREY = HexColor("#5c636a")


def header(c, title, n):
    c.setFillColor(DARK)
    c.rect(0, H - 46, W, 46, stroke=0, fill=1)
    c.setFillColor(ACCENT)
    c.rect(0, H - 49, W, 3, stroke=0, fill=1)
    c.setFillColor(HexColor("#ffffff"))
    c.setFont("Helvetica-Bold", 17)
    c.drawString(M, H - 30, title)
    c.setFont("Helvetica", 9)
    c.drawRightString(W - M, H - 30, f"Hallenfest – 3D-Plan   |   Seite {n}")


def image_page(c, img, title, caption, n):
    header(c, title, n)
    box_w, box_h = W - 2 * M, H - 49 - 2 * M - 26
    ratio = 2400 / 1500
    iw = box_w
    ih = iw / ratio
    if ih > box_h:
        ih = box_h
        iw = ih * ratio
    x = (W - iw) / 2
    y = M + 26 + (box_h - ih) / 2
    jpg = img.with_suffix(".jpg")
    Image.open(img).convert("RGB").save(jpg, quality=85, optimize=True)
    c.drawImage(str(jpg), x, y, iw, ih)
    c.setFillColor(GREY)
    c.setFont("Helvetica", 10)
    c.drawString(x, M + 6, caption)
    c.linkURL(LINK, (W - M - 190, M, W - M, M + 18))
    c.setFillColor(HexColor("#1c7ed6"))
    c.drawRightString(W - M, M + 6, "Interaktives 3D-Modell öffnen ›")


def notes_page(c, n):
    header(c, "Hinweise & Annahmen", n)
    c.setFillColor(DARK)
    y = H - 90
    c.setFont("Helvetica-Bold", 13)
    c.drawString(M, y, "Interaktives 3D-Modell (Handy & PC, ohne Login):")
    y -= 20
    c.setFont("Helvetica", 12)
    c.setFillColor(HexColor("#1c7ed6"))
    c.drawString(M, y, LINK)
    c.linkURL(LINK, (M, y - 4, M + 420, y + 14))
    y -= 18
    c.setFillColor(GREY)
    c.setFont("Helvetica", 10)
    c.drawString(M, y, "Bedienung: 1 Finger/linke Maustaste drehen · 2 Finger/Mausrad zoomen · Ansichts-Buttons unten.")
    y -= 36
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(M, y, "Annahmen")
    c.setFont("Helvetica", 11)
    for line in NOTES:
        y -= 22
        c.drawString(M + 4, y, "•  " + line)


def main():
    c = canvas.Canvas(str(PDF), pagesize=(W, H))
    c.setTitle("Hallenfest – 3D-Plan")
    n = 1
    for key, title, caption in PAGES:
        image_page(c, OUT / f"{key}.png", title, caption, n)
        c.showPage()
        n += 1
    notes_page(c, n)
    c.showPage()
    c.save()
    print("PDF:", PDF)


if __name__ == "__main__":
    main()
