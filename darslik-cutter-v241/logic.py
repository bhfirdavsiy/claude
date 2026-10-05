from __future__ import annotations
from pdf_service import map_book_page_span, resolve_lesson_marker_range

def _resolve_mapped_book_range(start, end, anchors, pdf_pages):
    ss = map_book_page_span(start, anchors)
    es = map_book_page_span(end, anchors)
    if ss is None or es is None:
        return None, None, "Tanlangan kitob betlari uchun ishonchli PDF mosligi topilmadi. Bet mosligini sozlang."
    ps, pe = ss[0], es[1]
    if ps < 1 or pe < ps or pe > pdf_pages:
        return None, None, f"Moslangan PDF oralig‘i noto‘g‘ri: {ps}–{pe}. PDFda {pdf_pages} sahifa bor."
    return ps, pe, ""

def _mapping_warns(start, end, anchors):
    if not anchors:
        return []
    if len(anchors) == 1:
        try:
            a = anchors[0]
            b = int(a["book_page"] if hasattr(a, "keys") else a[0])
        except Exception:
            b = None
        if b is None or start != b or end != b:
            return ["Bet mosligi faqat 1 tayanchga asoslangan; 1:1 siljish taxmin qilinmoqda. Previewni tekshiring yoki ikkinchi tayanch qo‘shing."]
    return []

def resolve_book_page_range(start:int, end:int, anchors, pdf_pages:int):
    if pdf_pages < 1:
        return {"error":"PDFda sahifa topilmadi."}
    if start < 1 or end < start:
        return {"error":f"Kitob betlari oralig‘i noto‘g‘ri: {start}–{end}."}
    ps, pe, err = _resolve_mapped_book_range(start,end,anchors,pdf_pages)
    if err:
        return {"error":err, "book":(start,end), "warns":[]}
    return {"book":(start,end),"pdf":(ps,pe),"warns":_mapping_warns(start,end,anchors),"book_page_mode":True,"method":"page-map"}

def resolve_lesson_range(catalog, subject, grade, resource_type, start, end, anchors, pdf_pages, lesson_markers=None):
    if pdf_pages < 1:
        return {"error":"PDFda sahifa topilmadi."}
    if start < 1 or end < start:
        return {"error":f"Dars oralig‘i noto‘g‘ri: {start}–{end}."}

    direct = resolve_lesson_marker_range(start, end, lesson_markers or [], pdf_pages)
    if direct:
        direct["book"] = None
        direct["book_page_mode"] = False
        return direct

    if subject == "Aniqlanmadi":
        return {"error":"Fan aniqlanmagan. Fan, sinf va resurs turini tanlang."}

    bounds, warns = catalog.lesson_bounds(subject, grade, start, end, resource_type)
    if not bounds:
        reason = warns[0] if warns else "TMR ma’lumoti topilmadi."
        if lesson_markers:
            reason += " PDFda aynan tanlangan dars raqamlari ham topilmadi."
        else:
            reason += " PDF matnida dars raqami belgilarini ham avtomatik topib bo‘lmadi."
        return {"error": reason}
    bs, be = bounds
    ps, pe, err = _resolve_mapped_book_range(bs,be,anchors,pdf_pages)
    if err:
        return {"error":err, "book":(bs,be), "warns":warns}
    warns = list(warns) + _mapping_warns(bs,be,anchors)
    return {"book":(bs,be),"pdf":(ps,pe),"lesson":(start,end),"warns":warns,"book_page_mode":False,"method":"tmr-page-map"}
