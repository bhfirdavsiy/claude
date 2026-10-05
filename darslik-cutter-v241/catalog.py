from __future__ import annotations
import json
from dataclasses import dataclass
from app_paths import resource_path

RESOURCE_LABELS = {
    "textbook": "Darslik",
    "workbook": "Daftar",
    "creative_workbook": "Ijod daftari",
    "exercise_book": "Mashq daftari",
}

@dataclass(frozen=True)
class CatalogIssue:
    severity: str
    message: str

class Catalog:
    """Read-only verified TMR catalog.

    Safety rule: there is NO cross-resource fallback. If a workbook mapping is
    absent, textbook page data must never be used silently.
    """
    def __init__(self):
        p = resource_path("data/tmr_catalog.json")
        self.raw = json.loads(p.read_text(encoding="utf-8"))
        self.year = self.raw.get("school_year", "2026-2027")
        self.items = self.raw.get("items", [])
        self._issues = {}
        for item in self.items:
            key = self._key(item["subject"], int(item["grade"]), item.get("resource_type", "textbook"))
            self._issues[key] = self._validate_item(item)

    @staticmethod
    def _key(subject, grade, resource_type):
        return (subject, int(grade), resource_type or "textbook")

    def subjects(self):
        return sorted({x["subject"] for x in self.items})

    def grades(self, subject=None):
        return sorted({int(x["grade"]) for x in self.items if not subject or x["subject"] == subject})

    def resources(self, subject, grade):
        return sorted({x.get("resource_type", "textbook") for x in self.items
                       if x["subject"] == subject and int(x["grade"]) == int(grade)})

    def find(self, subject, grade, resource_type="textbook"):
        for x in self.items:
            if (x["subject"] == subject and int(x["grade"]) == int(grade)
                    and x.get("resource_type", "textbook") == resource_type):
                return x
        return None

    def issues(self, subject, grade, resource_type="textbook"):
        return list(self._issues.get(self._key(subject, grade, resource_type), []))

    def is_profile_usable(self, subject, grade, resource_type="textbook"):
        item = self.find(subject, grade, resource_type)
        if not item:
            return False, "Bu fan/sinf/resurs uchun TMR profili mavjud emas."
        fatal = [x.message for x in self.issues(subject, grade, resource_type) if x.severity == "error"]
        if fatal:
            return False, fatal[0]
        return True, ""

    def _validate_item(self, item):
        issues = []
        rows = item.get("lessons") or []
        seen = set()
        last_no = 0
        last_start = None
        for r in rows:
            n = int(r.get("lesson_no", 0) or 0)
            if n < 1 or n in seen:
                issues.append(CatalogIssue("error", f"TMRda takror/noto‘g‘ri dars raqami: {n}."))
            seen.add(n)
            if n <= last_no:
                issues.append(CatalogIssue("error", "TMR dars raqamlari qat’iy o‘sish tartibida emas."))
            last_no = n
            a, b = r.get("page_start"), r.get("page_end")
            if (a is None) != (b is None):
                issues.append(CatalogIssue("error", f"{n}-dars bet oralig‘i to‘liq emas."))
            if a is not None:
                a, b = int(a), int(b)
                if a < 1 or b < a:
                    issues.append(CatalogIssue("error", f"{n}-dars bet oralig‘i noto‘g‘ri: {a}–{b}."))
                if last_start is not None and a < last_start:
                    issues.append(CatalogIssue(
                        "error",
                        f"TMR betlari orqaga qaytgan: {n}-dars {a}-bet, oldingi mapped dars {last_start}-bet."
                    ))
                last_start = a
        if not rows:
            issues.append(CatalogIssue("error", "TMR profili bo‘sh."))
        mapped = sum(1 for r in rows if r.get("page_start") is not None and r.get("page_end") is not None)
        if mapped == 0:
            issues.append(CatalogIssue("error", "Bu TMR profilida darslik betlari umuman ko‘rsatilmagan."))
        elif mapped < len(rows):
            issues.append(CatalogIssue(
                "warning",
                f"{len(rows)-mapped} ta dars uchun TMRda bet oralig‘i ko‘rsatilmagan; bunday darslar kesilmaydi."
            ))
        return issues

    def lesson_bounds(self, subject, grade, start, end, resource_type="textbook"):
        item = self.find(subject, grade, resource_type)
        if not item:
            return None, [f"{RESOURCE_LABELS.get(resource_type, resource_type)} uchun TMR topilmadi."]
        usable, reason = self.is_profile_usable(subject, grade, resource_type)
        if not usable:
            return None, [reason]
        rows = {int(r["lesson_no"]): r for r in item.get("lessons", [])}
        nums = list(range(int(start), int(end) + 1))
        missing = [n for n in nums if n not in rows]
        if missing:
            return None, ["TMRda dars raqami topilmadi: " + ", ".join(map(str, missing))]
        unmapped = [n for n in nums if rows[n].get("page_start") is None or rows[n].get("page_end") is None]
        if unmapped:
            return None, [
                "Tanlangan diapazondagi quyidagi darslar uchun TMRda bet ko‘rsatilmagan: "
                + ", ".join(map(str, unmapped))
                + ". Xavfsizlik uchun dastur betni taxmin qilmaydi."
            ]
        selected = [rows[n] for n in nums]
        ps = int(selected[0]["page_start"])
        pe = int(selected[-1]["page_end"])
        if pe < ps:
            return None, ["TMRdagi tanlangan bet oralig‘i mantiqan noto‘g‘ri."]
        return (ps, pe), []

    def lesson_title(self, subject, grade, lesson_no, resource_type="textbook"):
        item = self.find(subject, grade, resource_type)
        if not item:
            return ""
        for r in item.get("lessons", []):
            if int(r.get("lesson_no", 0)) == int(lesson_no):
                title = str(r.get("title") or "").strip()
                title = __import__("re").sub(r"\s+1$", "", title).strip()
                return title
        return ""

    def lesson_exists(self, subject, grade, lesson_no, resource_type="textbook"):
        item = self.find(subject, grade, resource_type)
        if not item:
            return False
        return any(int(r.get("lesson_no",0)) == int(lesson_no) for r in item.get("lessons",[]))

    def max_lesson(self, subject, grade, resource_type="textbook"):
        item = self.find(subject, grade, resource_type)
        if not item:
            return 1
        return max((int(r["lesson_no"]) for r in item.get("lessons", [])), default=1)
