from __future__ import annotations
import re
from pathlib import Path

SUBJECT_SYNONYMS = {
    "tasviriy sanat": "Tasviriy san’at",
    "tasviriy san'at": "Tasviriy san’at",
    "oqish savodxonligi": "O‘qish savodxonligi",
    "o'qish savodxonligi": "O‘qish savodxonligi",
    "ona tili": "Ona tili", "matematika": "Matematika", "adabiyot": "Adabiyot",
    "tarbiya": "Tarbiya", "tabiiy fanlar": "Tabiiy fanlar", "informatika": "Informatika",
    "texnologiya": "Texnologiya", "musiqa": "Musiqa", "alifbe": "Alifbe",
    "tarixdan hikoyalar": "Tarixdan hikoyalar", "yozuv daftari": "Yozuv daftari",
    "mathematics": "Matematika", "matematics": "Matematika", "math": "Matematika",
}

def asciiish(s: str) -> str:
    return s.lower().replace("‘", "'").replace("’", "'").replace("ʻ", "'")

def guess_subject_grade(path: str, catalog):
    name = asciiish(Path(path).stem)
    subject = None
    for s in catalog.subjects():
        if asciiish(s) in name:
            subject = s
            break
    if not subject:
        for needle, canon in SUBJECT_SYNONYMS.items():
            if needle in name:
                subject = canon
                break
    m = re.search(r"(?<!\d)(1[01]|[1-9])\s*[-_ ]?sinf", name)
    if not m:
        m = re.search(r"(?:^|[^a-z0-9])(?:g|grade|gr)[-_ ]?(1[01]|[1-9])(?:[^0-9]|$)", name, re.I)
    grade = int(m.group(1)) if m else None
    if "ijod" in name and "daftar" in name:
        resource = "creative_workbook"
    elif "mashq" in name and "daftar" in name:
        resource = "exercise_book"
    elif "workbook" in name or "daftar" in name:
        resource = "workbook"
    else:
        resource = "textbook"
    return subject, grade, resource
