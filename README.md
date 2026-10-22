# Hallenfest – 3D-Plan

Interaktives 3D-Modell des Hallenfest-Lageplans (three.js, läuft im Browser auf Handy und PC):
https://kaisrjakob.github.io/hallenfest-3d/

PDF mit gerenderten Ansichten: [hallenplan-3d.pdf](hallenplan-3d.pdf)

Maße sind aus dem 2D-Plan abgeleitet (3 Europaletten = 2,4 m), nicht vermessen.

PDF neu erzeugen (lokaler Server auf Port 8765 nötig):

```
python -m http.server 8765
python render/render_views.py
python render/build_pdf.py
```
