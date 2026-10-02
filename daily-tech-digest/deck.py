"""Runs in the session's shell: turns /workspace/digest.json into a slide deck, /workspace/deck.pdf (a title slide,
then one slide per story). Needs fpdf2 (the session's setup installs it)."""
import json
import os

from fpdf import FPDF

d = json.load(open("/workspace/digest.json"))
font = next((p for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf") if os.path.exists(p)), None)

pdf = FPDF(orientation="landscape", format="A4")
pdf.set_auto_page_break(False)
pdf.set_margins(20, 15, 20)  # ln() goes back to x = 20
if font:
    pdf.add_font("body", "", font)
    pdf.add_font("body", "B", font.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf") if os.path.exists(font.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf")) else font)
    family = "body"
else:
    family = "helvetica"


def text(s):
    return s if font else s.encode("latin-1", "replace").decode("latin-1")


pdf.add_page()
pdf.set_font(family, "B", 40)
pdf.set_xy(20, 70)
pdf.multi_cell(257, 18, text(d["title"]), align="L")
pdf.set_font(family, "", 18)
pdf.set_x(20)
pdf.multi_cell(257, 10, text(d["subtitle"]), align="L")

for i, s in enumerate(d["stories"], 1):
    pdf.add_page()
    pdf.set_fill_color(30, 64, 175)
    pdf.rect(0, 0, 297, 8, "F")
    pdf.set_xy(20, 20)
    pdf.set_font(family, "", 12)
    pdf.cell(0, 8, text(f"{i} / {len(d['stories'])}   ·   {s['where']}"))
    pdf.set_xy(20, 32)
    pdf.set_font(family, "B", 26)
    pdf.multi_cell(257, 12, text(s["title"]), align="L")
    pdf.set_x(20)
    pdf.set_font(family, "", 16)
    pdf.ln(4)
    pdf.multi_cell(257, 9, text(s["summary"]), align="L")
    pdf.ln(4)
    pdf.set_x(20)
    pdf.set_font(family, "B", 14)
    pdf.multi_cell(257, 8, text(f"Why it matters: {s['whyItMatters']}"), align="L")
    pdf.set_xy(20, 190)
    pdf.set_font(family, "", 10)
    pdf.set_text_color(30, 64, 175)
    pdf.cell(0, 6, text(s["url"][:150]), link=s["url"])
    pdf.set_text_color(0, 0, 0)

pdf.output("/workspace/deck.pdf")
print(f"deck.pdf: {len(d['stories']) + 1} slides, font {'DejaVu' if font else 'Helvetica (latin-1)'}")
