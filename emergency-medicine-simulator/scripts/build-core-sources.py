"""Extract the supplied course blueprint without publishing staff/personal details."""
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parents[3]
source = root / "attached_assets/0_OBJ_2025_updated_copy_2_copy_1791142580890.docx"
public = Path(__file__).resolve().parents[1] / "public"
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
with zipfile.ZipFile(source) as archive:
    document = ET.fromstring(archive.read("word/document.xml"))

def paragraphs(cell):
    return [s for p in cell.findall("w:p", ns)
            if (s := " ".join("".join(t.text or "" for t in p.findall(".//w:t", ns)).split()))]

# Repair line-wrap-only paragraph breaks, retaining the source wording.
joined = {
    1: ["List the hazards that must be considered when approaching an ill or injured person",
        "List the components of the systematic ABCDE Approach to emergency patients",
        "Describe the critical ABCDE actions", "List the elements of a SAMPLE history"],
    9: ["Recognition of cardiac arrest.", "Define High-Quality Cardiopulmonary Resuscitation (CPR)",
        "Perform High-Quality CPR",
        "Approaching Deferent cardiac arrest rhythms. (PEA, Asystole, pVT, VF) Knowing reversible causes of cardiac arrest.",
        "Electrical Therapy: [Automated external Defibrillator (AED), SYNC Cardioversion, DC Shock, Transcutaneous pacing (TCP)]",
        "Recognize Major Differences between adult, children, and Infants CPR"],
    33: ["Approach patient with Stroke", "Ischemic vs Hemorrhagic Stroke", "Approach patient with Seizure",
         "CNS infections (meningitis &encephalitis ): Clinical presentation,investigation ,management and complications",
         "Guillain barre syndrome: Types , pathophysiology,diagnosis and management"],
    34: ["Approach to agitated patients in ED.", "Approach to suicidal patients.",
         "Approach to psychosis disorders",
         "Neuroleptic malignant syndrome: Clinical presentation,causes and management",
         "Serotonin syndrome: Clinical presentation,causes and management"],
}
topics = []
for row in document.findall(".//w:tr", ns):
    cells = [paragraphs(c) for c in row.findall("w:tc", ns)]
    if len(cells) != 8 or not cells[0] or not cells[0][0].isdigit():
        continue
    number = int(cells[0][0])
    # Rows 12 and 13 are verbatim duplicates, not distinct topics.
    if number == 13:
        continue
    title = " / ".join(cells[4] or cells[3])
    objectives = joined.get(number, cells[5])
    topics.append({
        "id": f"EMED615-T{number:02}",
        "title": title,
        "sourceRows": [12, 13] if number == 12 else [number],
        "courseOutcomeIds": re.findall(r"\d\.\d", " ".join(cells[1])),
        "objectives": [{"id": f"EMED615-T{number:02}-O{i:02}", "text": text}
                       for i, text in enumerate(objectives, 1)],
    })
outcomes = []
for paragraph in document.findall(".//w:p", ns):
    text = " ".join("".join(t.text or "" for t in paragraph.findall(".//w:t", ns)).split())
    match = re.match(r"^([123]\.[123])\s+(.+)", text)
    if match and len(match[2]) > 30:
        outcomes.append({"id": "EMED615-CLO-" + match[1].replace(".", "-"), "text": match[2]})
assert len(topics) == 38 and len(outcomes) == 7
catalog = {
    "sourceId": "EMED615-2025",
    "title": "EMED615 Emergency Course — official 2025 blueprint",
    "notes": [
        "Stable mapping IDs were assigned by the simulator; they were not printed in the original blueprint.",
        "Source rows 12 and 13 repeat Cardiogenic Shock with identical objectives; combined into topic T12.",
        "Other wording, broad topic groups and possible source typos are preserved, not silently corrected.",
        "Some source paragraphs combine multiple skills; coverage requires addressing the whole objective.",
        "38 distinct topic groups imply 76 cases for a full-course pack, two per group.",
    ],
    "courseOutcomes": outcomes, "topics": topics,
}
(public / "EM_OFFICIAL_OBJECTIVES_v1.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
(public.parent / "src/data/official-objectives.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
lines = ["# Official Emergency Medicine course objectives", "", catalog["title"], "",
         "Source: user-supplied 2025 Master Exam Blueprint. Staff names and administrative details are omitted.",
         "", "## Normalization notes", *["- " + note for note in catalog["notes"]],
         "", "## Course learning outcomes"]
lines += [f"- **{o['id']}**: {o['text']}" for o in outcomes]
for topic in topics:
    lines += ["", f"## {topic['id']} — {topic['title']}",
              f"Source row(s): {', '.join(map(str, topic['sourceRows']))}. Course outcome codes: {', '.join(topic['courseOutcomeIds'])}."]
    lines += [f"- **{o['id']}**: {o['text']}" for o in topic["objectives"]]
(public / "EM_OFFICIAL_OBJECTIVES_v1.md").write_text("\n".join(lines) + "\n")
print(f"Extracted {len(topics)} topics, {sum(len(t['objectives']) for t in topics)} topic objectives and {len(outcomes)} course outcomes.")