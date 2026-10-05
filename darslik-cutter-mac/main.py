from __future__ import annotations
import io, os, re, sys, tempfile
from pathlib import Path
import fitz
from PIL import Image
from PySide6.QtCore import Qt
from PySide6.QtGui import QIntValidator, QPixmap, QImage
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QGridLayout,
    QLabel, QPushButton, QFileDialog, QComboBox, QLineEdit, QCheckBox,
    QMessageBox, QGroupBox, QScrollArea, QSlider
)

APP_VERSION = "2.4.1"

def safe_name(s: str) -> str:
    s = re.sub(r'[\\/:*?"<>|]+', "_", s).strip()
    return re.sub(r"\s+", " ", s) or "Darslik"

def scan_lesson_markers(doc: fitz.Document) -> dict[int,int]:
    patterns = [
        re.compile(r"(?im)^\s*(\d{1,3})\s*[-–—.]?\s*(?:dars|sabaq|урок)\b"),
        re.compile(r"(?im)\b(?:dars|sabaq|урок|lesson)\s*[№#:]?\s*(\d{1,3})\b"),
    ]
    found: dict[int,int] = {}
    for i, page in enumerate(doc):
        text = page.get_text("text") or ""
        for pat in patterns:
            for m in pat.finditer(text):
                n = int(m.group(1))
                if 1 <= n <= 500 and n not in found:
                    found[n] = i + 1
    return found

def scan_printed_pages(doc: fitz.Document) -> dict[int,int]:
    result: dict[int,int] = {}
    for i, page in enumerate(doc):
        r = page.rect
        clips = [
            fitz.Rect(r.x0, r.y0, r.x1, r.y0 + r.height * .15),
            fitz.Rect(r.x0, r.y1 - r.height * .15, r.x1, r.y1),
        ]
        candidates = []
        for clip in clips:
            txt = page.get_text("text", clip=clip) or ""
            for line in txt.splitlines():
                m = re.fullmatch(r"\s*(\d{1,4})\s*", line)
                if m:
                    candidates.append(int(m.group(1)))
        for n in candidates:
            if 1 <= n <= 2000 and n not in result:
                result[n] = i + 1
    return result

def resolve_lesson(markers: dict[int,int], start: int, end: int, total: int):
    if start not in markers or end not in markers:
        return None
    ps = markers[start]
    later = sorted(p for n,p in markers.items() if n > end and p > ps)
    pe = (later[0] - 1) if later else total
    if pe < markers[end]:
        pe = markers[end]
    return ps, min(pe, total)

def resolve_book(page_map: dict[int,int], start: int, end: int):
    if start not in page_map or end not in page_map:
        return None
    ps, pe = page_map[start], page_map[end]
    return (ps, pe) if ps <= pe else None

def apply_watermark(doc: fitz.Document, kind: str, text: str, image_path: str,
                    position: str, opacity: float):
    if kind == "Rasm" and image_path:
        im = Image.open(image_path).convert("RGBA")
        alpha = im.getchannel("A").point(lambda x: int(x * opacity))
        im.putalpha(alpha)
        bio = io.BytesIO()
        im.save(bio, format="PNG")
        img = bio.getvalue()
    else:
        img = None

    for page in doc:
        r = page.rect
        if position == "Butun bet":
            rect = fitz.Rect(r.width*.10, r.height*.10, r.width*.90, r.height*.90)
            fs = max(28, min(r.width, r.height) / 8)
            point = fitz.Point(r.width*.18, r.height*.58)
            angle = 45
        elif position == "Markaz":
            rect = fitz.Rect(r.width*.25, r.height*.35, r.width*.75, r.height*.65)
            fs = max(18, min(r.width, r.height) / 18)
            point = fitz.Point(r.width*.35, r.height*.52)
            angle = 0
        else:
            w,h = r.width*.26, r.height*.12
            x = r.width*.03 if "Chap" in position else r.width-w-r.width*.03
            y = r.height*.03 if "Yuqori" in position else r.height-h-r.height*.03
            rect = fitz.Rect(x,y,x+w,y+h)
            fs = max(12, min(r.width, r.height) / 30)
            point = fitz.Point(rect.x0, rect.y0 + rect.height*.65)
            angle = 0

        if kind == "Rasm" and img:
            page.insert_image(rect, stream=img, overlay=True, keep_proportion=True)
        else:
            if not text:
                continue
            morph = None
            if angle:
                morph = (point, fitz.Matrix(1,1).prerotate(angle))
            page.insert_text(point, text, fontsize=fs, color=(0.45,0.45,0.45),
                             fill_opacity=opacity, overlay=True, morph=morph)

def save_pdf(doc: fitz.Document, out_path: str, protect: bool, owner_pw: str):
    tmp = out_path + ".tmp.pdf"
    kwargs = dict(garbage=4, deflate=True, clean=True)
    if protect and owner_pw:
        kwargs.update(
            encryption=fitz.PDF_ENCRYPT_AES_256,
            owner_pw=owner_pw,
            user_pw="",
            permissions=fitz.PDF_PERM_PRINT | fitz.PDF_PERM_COPY | fitz.PDF_PERM_ACCESSIBILITY,
        )
    doc.save(tmp, **kwargs)
    check = fitz.open(tmp)
    if check.needs_pass:
        check.close()
        os.remove(tmp)
        raise RuntimeError("Yakuniy PDF ochishda parol so‘rayapti. Saqlash bekor qilindi.")
    check.close()
    os.replace(tmp, out_path)

class RangeRow(QWidget):
    def __init__(self, remove_cb=None):
        super().__init__()
        self.remove_cb = remove_cb
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0,0,0,0)
        self.start = QLineEdit(); self.end = QLineEdit()
        self.start.setPlaceholderText("Boshlanish")
        self.end.setPlaceholderText("Oxiri")
        v = QIntValidator(1, 9999, self)
        self.start.setValidator(v); self.end.setValidator(QIntValidator(1,9999,self))
        lay.addWidget(self.start); lay.addWidget(QLabel("—")); lay.addWidget(self.end)
        if remove_cb:
            b=QPushButton("×"); b.setFixedWidth(34); b.clicked.connect(lambda: remove_cb(self))
            lay.addWidget(b)
    def values(self):
        if not self.start.text() or not self.end.text():
            return None
        return int(self.start.text()), int(self.end.text())

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"Darslik Cutter {APP_VERSION}")
        self.resize(940, 760)
        self.pdf_path = ""
        self.doc = None
        self.lesson_markers = {}
        self.page_map = {}
        self.rows = []
        self.image_path = ""

        root = QWidget(); self.setCentralWidget(root)
        main = QVBoxLayout(root)

        file_box = QGroupBox("1. PDF")
        fl = QHBoxLayout(file_box)
        self.file_label = QLabel("PDF tanlanmagan")
        open_btn = QPushButton("PDF tanlash"); open_btn.clicked.connect(self.open_pdf)
        fl.addWidget(open_btn); fl.addWidget(self.file_label,1)
        main.addWidget(file_box)

        mode_box = QGroupBox("2. Kesish diapazonlari")
        ml = QVBoxLayout(mode_box)
        top = QHBoxLayout()
        self.mode = QComboBox()
        self.mode.addItems(["Dars/mavzu raqami bo‘yicha","Kitob beti bo‘yicha"])
        top.addWidget(QLabel("Rejim:")); top.addWidget(self.mode,1)
        add = QPushButton("+ Diapazon qo‘shish"); add.clicked.connect(self.add_row)
        top.addWidget(add); ml.addLayout(top)
        self.rows_box = QVBoxLayout(); ml.addLayout(self.rows_box)
        self.add_row(first=True)
        main.addWidget(mode_box)

        wm = QGroupBox("3. Mualliflik belgisi (ixtiyoriy)")
        wl = QGridLayout(wm)
        self.wm_on = QCheckBox("Mualliflik belgisi qo‘shish")
        self.wm_kind = QComboBox(); self.wm_kind.addItems(["Matn","Rasm"])
        self.wm_text = QLineEdit(); self.wm_text.setPlaceholderText("Mualliflik belgisi matni")
        self.wm_img = QPushButton("Rasm tanlash"); self.wm_img.clicked.connect(self.pick_image)
        self.wm_pos = QComboBox(); self.wm_pos.addItems(["Butun bet","Markaz","O‘ng past","Chap past","O‘ng yuqori","Chap yuqori"])
        self.wm_opacity = QSlider(Qt.Horizontal); self.wm_opacity.setRange(5,80); self.wm_opacity.setValue(20)
        wl.addWidget(self.wm_on,0,0,1,2)
        wl.addWidget(QLabel("Turi:"),1,0); wl.addWidget(self.wm_kind,1,1)
        wl.addWidget(QLabel("Matn:"),2,0); wl.addWidget(self.wm_text,2,1)
        wl.addWidget(QLabel("Rasm:"),3,0); wl.addWidget(self.wm_img,3,1)
        wl.addWidget(QLabel("Joylashuv:"),4,0); wl.addWidget(self.wm_pos,4,1)
        wl.addWidget(QLabel("Shaffoflik:"),5,0); wl.addWidget(self.wm_opacity,5,1)
        main.addWidget(wm)

        sec = QGroupBox("4. Tahrirlashdan himoya (ixtiyoriy)")
        sl = QGridLayout(sec)
        self.protect = QCheckBox("PDFga o‘zgartirishlar kiritishni parol bilan himoyalash")
        self.password = QLineEdit(); self.password.setEchoMode(QLineEdit.Password)
        self.show_pw = QCheckBox("Parolni ko‘rsatish")
        self.show_pw.toggled.connect(lambda on: self.password.setEchoMode(QLineEdit.Normal if on else QLineEdit.Password))
        sl.addWidget(self.protect,0,0,1,2)
        sl.addWidget(QLabel("Parol:"),1,0); sl.addWidget(self.password,1,1)
        sl.addWidget(self.show_pw,2,1)
        main.addWidget(sec)

        self.summary = QLabel("PDF tanlang va diapazonlarni kiriting.")
        self.summary.setWordWrap(True); main.addWidget(self.summary)
        export_btn = QPushButton("Alohida PDF fayllarga saqlash")
        export_btn.setMinimumHeight(44); export_btn.clicked.connect(self.export_all)
        main.addWidget(export_btn)

    def add_row(self, first=False):
        row = RangeRow(None if first else self.remove_row)
        self.rows.append(row); self.rows_box.addWidget(row)

    def remove_row(self, row):
        if row in self.rows:
            self.rows.remove(row); row.setParent(None); row.deleteLater()

    def pick_image(self):
        p,_ = QFileDialog.getOpenFileName(self,"Watermark rasmi","","Images (*.png *.jpg *.jpeg *.webp)")
        if p:
            self.image_path=p; self.wm_img.setText(Path(p).name)

    def open_pdf(self):
        p,_=QFileDialog.getOpenFileName(self,"PDF tanlash","","PDF (*.pdf)")
        if not p: return
        try:
            d=fitz.open(p)
            if d.needs_pass:
                QMessageBox.warning(self,"PDF","Parolli kirish PDFlari hozir qo‘llab-quvvatlanmaydi.")
                d.close(); return
            if self.doc: self.doc.close()
            self.doc=d; self.pdf_path=p
            self.lesson_markers=scan_lesson_markers(d)
            self.page_map=scan_printed_pages(d)
            self.file_label.setText(f"{Path(p).name} — {len(d)} sahifa")
            for r in self.rows:
                r.start.clear(); r.end.clear()
            self.summary.setText(f"PDF yuklandi. Dars markerlari: {len(self.lesson_markers)}. Kitob beti tayanchlari: {len(self.page_map)}.")
        except Exception as e:
            QMessageBox.critical(self,"Xato",str(e))

    def collect_ranges(self):
        out=[]
        for i,row in enumerate(self.rows,1):
            v=row.values()
            if not v:
                raise ValueError(f"{i}-diapazon to‘liq kiritilmagan.")
            a,b=v
            if a<1 or b<a:
                raise ValueError(f"{i}-diapazon noto‘g‘ri: {a}–{b}.")
            out.append((a,b))
        s=sorted(out)
        for (a,b),(c,d) in zip(s,s[1:]):
            if c<=b:
                raise ValueError("Diapazonlar ustma-ust tushmasligi kerak.")
        return out

    def resolve(self,a,b):
        if self.mode.currentIndex()==0:
            return resolve_lesson(self.lesson_markers,a,b,len(self.doc))
        return resolve_book(self.page_map,a,b)

    def export_all(self):
        if not self.doc or not self.pdf_path:
            QMessageBox.warning(self,"PDF","Avval PDF tanlang."); return
        try:
            ranges=self.collect_ranges()
            if self.protect.isChecked() and not self.password.text():
                raise ValueError("Tahrirlashdan himoya uchun parol kiriting.")
            if self.wm_on.isChecked() and self.wm_kind.currentText()=="Rasm" and not self.image_path:
                raise ValueError("Watermark uchun rasm tanlang.")
            outdir=QFileDialog.getExistingDirectory(self,"Natijalarni saqlash papkasi")
            if not outdir: return
            base=safe_name(Path(self.pdf_path).stem)
            created=[]
            for a,b in ranges:
                rp=self.resolve(a,b)
                if not rp:
                    label="dars" if self.mode.currentIndex()==0 else "kitob beti"
                    raise ValueError(f"{a}–{b} {label} oralig‘i uchun ishonchli moslik topilmadi.")
                ps,pe=rp
                part=fitz.open()
                part.insert_pdf(self.doc,from_page=ps-1,to_page=pe-1)
                if self.wm_on.isChecked():
                    apply_watermark(part,self.wm_kind.currentText(),self.wm_text.text(),self.image_path,
                                    self.wm_pos.currentText(),self.wm_opacity.value()/100.0)
                suffix="darslar" if self.mode.currentIndex()==0 else "betlar"
                out=os.path.join(outdir,f"{base}_{a}-{b}-{suffix}.pdf")
                save_pdf(part,out,self.protect.isChecked(),self.password.text())
                part.close(); created.append(out)
            self.summary.setText(f"Tayyor: {len(created)} ta alohida PDF yaratildi.")
            QMessageBox.information(self,"Tayyor","\n".join(Path(x).name for x in created))
        except Exception as e:
            QMessageBox.critical(self,"Xato",str(e))

def main():
    app=QApplication(sys.argv)
    w=MainWindow(); w.show()
    sys.exit(app.exec())

if __name__=="__main__":
    main()
