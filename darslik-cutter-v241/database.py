from __future__ import annotations
import sqlite3
from app_paths import app_data_dir

SCHEMA = r"""
CREATE TABLE IF NOT EXISTS profiles(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 fingerprint TEXT UNIQUE NOT NULL,
 file_name TEXT,
 file_size INTEGER,
 file_mtime_ns INTEGER,
 subject TEXT,
 grade INTEGER,
 resource_type TEXT DEFAULT 'textbook',
 school_year TEXT,
 page_count INTEGER,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS page_anchors(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 profile_id INTEGER NOT NULL,
 book_page INTEGER NOT NULL,
 pdf_page INTEGER NOT NULL,
 source TEXT DEFAULT 'manual',
 UNIQUE(profile_id, book_page),
 FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_page_anchors_profile ON page_anchors(profile_id, book_page);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
"""

class Database:
    def __init__(self):
        self.path = app_data_dir() / "darslik_cutter.db"
        self.conn = sqlite3.connect(self.path, timeout=5)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=5000")
        self.conn.executescript(SCHEMA)
        self._ensure_columns()
        self._migrate_v5()
        self.conn.commit()

    def _columns(self, table):
        return {r[1] for r in self.conn.execute(f"PRAGMA table_info({table})")}

    def _ensure_columns(self):
        cols = self._columns("profiles")
        if "file_size" not in cols:
            self.conn.execute("ALTER TABLE profiles ADD COLUMN file_size INTEGER")
        if "file_mtime_ns" not in cols:
            self.conn.execute("ALTER TABLE profiles ADD COLUMN file_mtime_ns INTEGER")

    def _migrate_v5(self):
        old = int(self.get_setting("mapping_schema_version", "1") or 1)
        if old < 5:
            self.conn.execute("DELETE FROM page_anchors WHERE source='auto'")
            self.set_setting("mapping_schema_version", "5")

    def profile(self, fingerprint):
        return self.conn.execute("SELECT * FROM profiles WHERE fingerprint=?", (fingerprint,)).fetchone()

    def upsert_profile(self, fingerprint, file_name, file_size, file_mtime_ns,
                       subject, grade, resource_type, school_year, page_count):
        self.conn.execute(
            """INSERT INTO profiles(
                 fingerprint,file_name,file_size,file_mtime_ns,subject,grade,resource_type,school_year,page_count
               ) VALUES(?,?,?,?,?,?,?,?,?)
               ON CONFLICT(fingerprint) DO UPDATE SET
                 file_name=excluded.file_name,
                 file_size=excluded.file_size,
                 file_mtime_ns=excluded.file_mtime_ns,
                 subject=excluded.subject,
                 grade=excluded.grade,
                 resource_type=excluded.resource_type,
                 school_year=excluded.school_year,
                 page_count=excluded.page_count,
                 updated_at=CURRENT_TIMESTAMP""",
            (fingerprint, file_name, file_size, file_mtime_ns, subject, grade,
             resource_type, school_year, page_count),
        )
        self.conn.commit()
        return self.profile(fingerprint)

    def update_profile_meta(self, pid, subject, grade, resource_type):
        self.conn.execute(
            "UPDATE profiles SET subject=?,grade=?,resource_type=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (subject, grade, resource_type, pid),
        )
        self.conn.commit()

    def anchors(self, pid):
        return list(self.conn.execute(
            "SELECT book_page,pdf_page,source FROM page_anchors WHERE profile_id=? ORDER BY book_page,pdf_page",
            (pid,),
        ))

    def _validate_anchor_set(self, pairs):
        pairs = sorted((int(b), int(p)) for b, p in pairs)
        if any(b < 1 or p < 1 for b, p in pairs):
            raise ValueError("Bet va PDF sahifa raqami 1 dan kichik bo‘lishi mumkin emas.")
        for (b0,p0),(b1,p1) in zip(pairs, pairs[1:]):
            if b1 <= b0:
                raise ValueError("Kitob betlari takrorlangan yoki tartibsiz.")
            if p1 < p0:
                raise ValueError(
                    f"Bet mosligi orqaga qaytmoqda: kitob {b0}→PDF {p0}, "
                    f"kitob {b1}→PDF {p1}."
                )

    def add_anchor(self, pid, book_page, pdf_page, source="manual"):
        existing = [(r["book_page"], r["pdf_page"]) for r in self.anchors(pid)
                    if int(r["book_page"]) != int(book_page)]
        proposed = existing + [(int(book_page), int(pdf_page))]
        self._validate_anchor_set(proposed)
        self.conn.execute(
            """INSERT INTO page_anchors(profile_id,book_page,pdf_page,source)
               VALUES(?,?,?,?)
               ON CONFLICT(profile_id,book_page) DO UPDATE SET
                 pdf_page=excluded.pdf_page,source=excluded.source""",
            (pid, int(book_page), int(pdf_page), source),
        )
        self.conn.commit()

    def replace_auto_anchors(self, pid, pairs):
        manual = [(int(r["book_page"]), int(r["pdf_page"]))
                  for r in self.anchors(pid) if r["source"] == "manual"]
        manual_books = {b for b,_ in manual}
        cleaned = [(int(b),int(p)) for b,p in pairs if int(b) not in manual_books]
        proposed = manual + cleaned
        self._validate_anchor_set(proposed)
        self.conn.execute("DELETE FROM page_anchors WHERE profile_id=? AND source='auto'", (pid,))
        for b,p in cleaned:
            self.conn.execute(
                "INSERT OR IGNORE INTO page_anchors(profile_id,book_page,pdf_page,source) VALUES(?,?,?,'auto')",
                (pid,b,p),
            )
        self.conn.commit()

    def get_setting(self, key, default=""):
        r = self.conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return r[0] if r else default

    def set_setting(self, key, value):
        self.conn.execute(
            "INSERT INTO settings(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )
        self.conn.commit()

    def close(self):
        self.conn.close()
