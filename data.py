"""Lapisan data prototype — SATU-SATUNYA tempat baca/tulis data.

Route dan template tidak boleh membaca file data langsung. Saat pindah ke
database/API/Next.js, cukup ganti isi file ini (nama fungsi dipertahankan).
Padanan Next.js: lib/data.ts

Sumber data:
    data/seed.json   data contoh awal (jangan diubah saat demo)
    data/store.json  salinan kerja, dibuat otomatis saat ada perubahan
                     (hapus file ini untuk mengembalikan data ke kondisi awal)

Bila filesystem read-only (mis. Vercel), perubahan hanya tersimpan di memori.
"""
import copy
import json
import re
import threading
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
SEED_PATH = DATA_DIR / "seed.json"
STORE_PATH = DATA_DIR / "store.json"

_lock = threading.Lock()
_db = None


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
def _load():
    global _db
    if _db is None:
        path = STORE_PATH if STORE_PATH.exists() else SEED_PATH
        with open(path, encoding="utf-8") as f:
            _db = json.load(f)
        for key in ("news", "programs", "registrations", "journal_issues"):
            _db.setdefault(key, [])
    return _db


def _save():
    try:
        with open(STORE_PATH, "w", encoding="utf-8") as f:
            json.dump(_db, f, ensure_ascii=False, indent=2)
    except OSError:
        pass  # read-only: data tetap di memori selama proses berjalan


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _next_id(items):
    nums = [int(i["id"]) for i in items if str(i.get("id", "")).isdigit()]
    return str(max(nums, default=0) + 1)


def _slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text or "berita"


def _unique_slug(base, existing):
    slug, n = base, 2
    while slug in existing:
        slug = f"{base}-{n}"
        n += 1
    return slug


def _registered_count(program_id):
    return sum(
        1 for r in _load()["registrations"]
        if r["program_id"] == program_id and r.get("status") != "ditolak"
    )


def _with_slots(program):
    p = copy.deepcopy(program)
    quota = p.get("quota") or 0
    p["registered"] = _registered_count(p["id"])
    p["slots_left"] = max(quota - p["registered"], 0) if quota else 10**6
    return p


# ---------------------------------------------------------------------------
# Berita
# ---------------------------------------------------------------------------
def get_news(published_only=True):
    with _lock:
        items = [n for n in _load()["news"]
                 if not published_only or n.get("status") == "published"]
        items.sort(key=lambda n: n.get("published_at") or "", reverse=True)
        return copy.deepcopy(items)


def get_news_by_slug(slug):
    """Hanya berita berstatus published (untuk halaman publik)."""
    with _lock:
        for n in _load()["news"]:
            if n["slug"] == slug and n.get("status") == "published":
                return copy.deepcopy(n)
    return None


def add_news(title, excerpt, body_html, status="published"):
    with _lock:
        db = _load()
        item = {
            "id": _next_id(db["news"]),
            "slug": _unique_slug(_slugify(title), {n["slug"] for n in db["news"]}),
            "title": title,
            "excerpt": excerpt,
            "body_html": body_html,
            "published_at": _now_iso(),
            "status": status,
        }
        db["news"].append(item)
        _save()
        return copy.deepcopy(item)


def delete_news(news_id):
    with _lock:
        db = _load()
        before = len(db["news"])
        db["news"] = [n for n in db["news"] if n["id"] != news_id]
        if len(db["news"]) == before:
            return False
        _save()
        return True


# ---------------------------------------------------------------------------
# Program kegiatan
# ---------------------------------------------------------------------------
def get_programs():
    """Tiap program ditambah: registered (jumlah pendaftar aktif), slots_left."""
    with _lock:
        return [_with_slots(p) for p in _load()["programs"]]


def get_program_by_slug(slug):
    with _lock:
        for p in _load()["programs"]:
            if p["slug"] == slug:
                return _with_slots(p)
    return None


# ---------------------------------------------------------------------------
# Pendaftaran
# ---------------------------------------------------------------------------
def add_registration(program_id, full_name, email, phone):
    with _lock:
        db = _load()
        reg = {
            "id": _next_id(db["registrations"]),
            "program_id": program_id,
            "full_name": full_name,
            "email": email,
            "phone": phone,
            "status": "menunggu",
            "created_at": _now_iso(),
        }
        db["registrations"].append(reg)
        _save()
        return copy.deepcopy(reg)


def get_registrations():
    """Terbaru dulu; tiap data ditambah program_name."""
    with _lock:
        db = _load()
        names = {p["id"]: p["name"] for p in db["programs"]}
        rows = copy.deepcopy(db["registrations"])
        for r in rows:
            r["program_name"] = names.get(r["program_id"], "(program dihapus)")
        rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        return rows


def update_registration_status(reg_id, status):
    with _lock:
        for r in _load()["registrations"]:
            if r["id"] == reg_id:
                r["status"] = status
                _save()
                return True
    return False


# ---------------------------------------------------------------------------
# Jurnal
# ---------------------------------------------------------------------------
def get_journal_issues():
    """Terbaru dulu (tahun, volume, nomor)."""
    with _lock:
        issues = copy.deepcopy(_load()["journal_issues"])
        issues.sort(key=lambda i: (i.get("year", 0), i.get("volume", 0),
                                   i.get("number", 0)), reverse=True)
        return issues


# ---------------------------------------------------------------------------
# Statistik dashboard admin
# ---------------------------------------------------------------------------
def get_stats():
    with _lock:
        db = _load()
        return {
            "news": len(db["news"]),
            "programs": len(db["programs"]),
            "registrations": len(db["registrations"]),
            "pending": sum(1 for r in db["registrations"]
                           if r.get("status") == "menunggu"),
        }
