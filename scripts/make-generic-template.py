"""Builds templates/generic-lld-template.docx: a neutral Word template tagged for docxtemplater.
Run: python scripts/make-generic-template.py
Use it as a reference when tagging the real MBCOM / Broadcom templates (see templates/TEMPLATE-TAGS.md)."""
from pathlib import Path
from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_BREAK

ROOT = Path(__file__).resolve().parent.parent
OUT = [ROOT / "templates" / "generic-lld-template.docx"]

doc = Document()
st = doc.styles["Normal"]
st.font.name = "Calibri"
st.font.size = Pt(10.5)
for name, size in (("Heading 1", 16), ("Heading 2", 13), ("Heading 3", 11)):
    doc.styles[name].font.size = Pt(size)
    doc.styles[name].font.color.rgb = RGBColor(0x1F, 0x3A, 0x5F)


def para(text, style=None, bold=False):
    p = doc.add_paragraph(style=style)
    r = p.add_run(text)  # one run per tag line so Word never splits a tag
    r.bold = bold
    return p


def kv_table(rows):
    t = doc.add_table(rows=0, cols=2)
    t.style = "Table Grid"
    for k, v in rows:
        c = t.add_row().cells
        c[0].text = k
        c[0].paragraphs[0].runs[0].bold = True
        c[1].text = v
    return t


# ---- cover ----
para("{docTitle}", "Title")
para("{customer}", "Subtitle")
kv_table([
    ("Template", "{projectType}"),
    ("VCF version", "{vcfVersion}"),
    ("Document version", "{docVersion}"),
    ("Date", "{date}"),
    ("Author", "{author}"),
    ("Catalogue version", "{catalogueVersion}"),
])
para("{#hasPending}")
para("Open items", "Heading 3")
para("{#pending}")
para("{id} - {title} ({reason})", "List Bullet")
para("{/pending}")
para("{/hasPending}")
doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

# ---- summary ----
para("Design Decision Summary", "Heading 1")
t = doc.add_table(rows=2, cols=4)
t.style = "Table Grid"
for i, h in enumerate(("Ref", "ID", "Decision area", "Decision")):
    t.rows[0].cells[i].text = h
    t.rows[0].cells[i].paragraphs[0].runs[0].bold = True
for i, v in enumerate(("{#summary}{ref}", "{id}", "{title}", "{decision}{/summary}")):
    t.rows[1].cells[i].text = v

# ---- body: domains > areas > decisions ----
para("{#domains}")
para("{title}", "Heading 1")
para("{#areas}")
para("{title}", "Heading 2")
para("{#decisions}")
para("{ref} {title} ({id})", "Heading 3")
kv_table([
    ("Design question", "{question}"),
    ("Decision", "{decision}"),
    ("Justification", "{justification}"),
    ("Implications", "{#implications}- {text}\n{/implications}"),
    ("Alternatives considered", "{#alternatives}{label}; {/alternatives}"),
])
para("{#hasVersionNote}Version note: {versionNote}{/hasVersionNote}")
para("{#hasNote}Customer-specific note: {note}{/hasNote}")
para("{#hasLinks}")
para("References:", bold=True)
para("{#links}")
para("{title} - {url}", "List Bullet")
para("{/links}")
para("{/hasLinks}")
para("{/decisions}")
para("{/areas}")
para("{/domains}")

# ---- references + glossary ----
para("References", "Heading 1")
para("{#references}")
para("{title} - {url}", "List Bullet")
para("{/references}")
para("Glossary", "Heading 1")
g = doc.add_table(rows=2, cols=2)
g.style = "Table Grid"
g.rows[0].cells[0].text = "Term"
g.rows[0].cells[1].text = "Definition"
g.rows[1].cells[0].text = "{#glossary}{term}"
g.rows[1].cells[1].text = "{definition}{/glossary}"

for o in OUT:
    o.parent.mkdir(parents=True, exist_ok=True)
    doc.save(o)
    print("wrote", o.relative_to(ROOT))
