"""Pusjilal Web — prototype (Flask).

Semua route ada di file ini. Akses data HANYA lewat data.py.
Jalankan: flask --app app run --debug

Variabel .env yang dipakai:
    SECRET_KEY, ADMIN_USERNAME, ADMIN_PASSWORD_HASH,
    CONTACT_EMAIL, CONTACT_PHONE, CONTACT_ADDRESS
"""
import os
import re
from datetime import datetime
from functools import wraps
from urllib.parse import urlparse

from flask import (Flask, abort, flash, redirect, render_template, request,
                   session, url_for)
from markupsafe import escape
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # python-dotenv opsional
    pass

import data

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "dev-only-ganti-di-env")

# ---------------------------------------------------------------------------
# Konfigurasi
# ---------------------------------------------------------------------------
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH")
if not ADMIN_PASSWORD_HASH:
    # Mode demo saja. Di produksi WAJIB set ADMIN_PASSWORD_HASH.
    ADMIN_PASSWORD_HASH = generate_password_hash("demo123")
    print("[PERINGATAN] ADMIN_PASSWORD_HASH belum diatur. Mode demo: admin / demo123")

SITE = {
    "name": "Pusjilal",
    "full_name": "Pusat Kajian dan Advokasi Halal",
    "tagline": "Kajian, advokasi, dan layanan halal",
    "email": os.getenv("CONTACT_EMAIL", "Belum diatur"),
    "phone": os.getenv("CONTACT_PHONE", "Belum diatur"),
    "address": os.getenv("CONTACT_ADDRESS", "Belum diatur"),
}

# (label, nama endpoint) -> dipakai navbar. Padanan Next.js: daftar link di Navbar.tsx
NAV = [
    ("Beranda", "index"),
    ("Profil", "profil"),
    ("Layanan", "layanan"),
    ("Berita", "berita"),
    ("Pendaftaran", "pendaftaran"),
    ("Jurnal", "jurnal"),
    ("Kontak", "kontak"),
]

REG_STATUSES = ["menunggu", "diverifikasi", "ditolak"]
NEWS_STATUSES = ["published", "draft"]

BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
         "Agustus", "September", "Oktober", "November", "Desember"]
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------------------
# Util (padanan Next.js: lib/format.ts)
# ---------------------------------------------------------------------------
@app.template_filter("tgl")
def format_tanggal(iso):
    """'2026-10-05T00:00:00Z' -> '5 Oktober 2026'."""
    if not iso:
        return ""
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return iso
    return f"{d.day} {BULAN[d.month - 1]} {d.year}"


def text_to_html(text):
    """Teks biasa -> HTML paragraf (di-escape, aman untuk |safe)."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    return "".join(
        "<p>" + str(escape(p)).replace("\n", "<br>") + "</p>" for p in paras
    )


def validate_registration(form):
    errors = {}
    if not 3 <= len(form["full_name"]) <= 100:
        errors["full_name"] = "Nama lengkap 3–100 karakter."
    if len(form["email"]) > 120 or not EMAIL_RE.match(form["email"]):
        errors["email"] = "Format email tidak valid."
    digits = re.sub(r"\D", "", form["phone"])
    if not 9 <= len(digits) <= 15:
        errors["phone"] = "Nomor telepon/WhatsApp tidak valid."
    return errors


@app.context_processor
def inject_globals():
    return {"site": SITE, "nav": NAV, "is_admin": bool(session.get("admin"))}


# ---------------------------------------------------------------------------
# Halaman publik
# ---------------------------------------------------------------------------
@app.get("/")
def index():
    issues = data.get_journal_issues()
    return render_template(
        "index.html",
        news=data.get_news()[:3],
        programs=[p for p in data.get_programs() if p["is_open"]],
        issue=issues[0] if issues else None,
    )


@app.get("/profil")
def profil():
    return render_template("profil.html")


@app.get("/layanan")
def layanan():
    return render_template("layanan.html")


@app.get("/berita")
def berita():
    return render_template("berita.html", news=data.get_news())


@app.get("/berita/<slug>")
def berita_detail(slug):
    item = data.get_news_by_slug(slug)
    if not item:
        abort(404)
    return render_template("berita_detail.html", item=item)


@app.get("/kontak")
def kontak():
    return render_template("kontak.html")


@app.get("/jurnal")
def jurnal():
    return render_template("jurnal.html", issues=data.get_journal_issues())


# ---------------------------------------------------------------------------
# Pendaftaran kegiatan (satu template: daftar program ATAU formulir)
# ---------------------------------------------------------------------------
@app.get("/pendaftaran")
def pendaftaran():
    return render_template("pendaftaran.html", programs=data.get_programs(),
                           program=None, form={}, errors={})


@app.route("/pendaftaran/<slug>", methods=["GET", "POST"])
def pendaftaran_form(slug):
    program = data.get_program_by_slug(slug)
    if not program:
        abort(404)

    closed = (not program["is_open"]) or program["slots_left"] <= 0
    form = {"full_name": "", "email": "", "phone": ""}
    errors = {}

    if request.method == "POST":
        form = {k: request.form.get(k, "").strip() for k in form}
        if closed:
            errors["_"] = "Pendaftaran untuk program ini sudah ditutup atau kuota penuh."
        else:
            errors = validate_registration(form)
        if not errors:
            data.add_registration(program["id"], form["full_name"],
                                  form["email"], form["phone"])
            flash("Pendaftaran berhasil dikirim. Panitia akan menghubungi Anda.", "success")
            return redirect(url_for("pendaftaran"))

    return render_template("pendaftaran.html", programs=None, program=program,
                           closed=closed, form=form, errors=errors)


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------
def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin"):
            return redirect(url_for("admin_login", next=request.path))
        return view(*args, **kwargs)
    return wrapped


def safe_next(target):
    """Hanya izinkan redirect internal ke /admin..."""
    if not target:
        return None
    parsed = urlparse(target)
    if parsed.scheme or parsed.netloc or not target.startswith("/admin"):
        return None
    return target


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if username == ADMIN_USERNAME and check_password_hash(ADMIN_PASSWORD_HASH, password):
            session.clear()
            session["admin"] = True
            return redirect(safe_next(request.args.get("next")) or url_for("admin_dashboard"))
        error = "Username atau password salah."
    return render_template("admin/login.html", error=error)


@app.post("/admin/logout")
def admin_logout():
    session.clear()
    return redirect(url_for("index"))


@app.get("/admin")
@login_required
def admin_dashboard():
    return render_template(
        "admin/dashboard.html",
        stats=data.get_stats(),
        news=data.get_news(published_only=False),
        registrations=data.get_registrations(),
        reg_statuses=REG_STATUSES,
        news_statuses=NEWS_STATUSES,
    )


@app.post("/admin/berita")
@login_required
def admin_berita_tambah():
    title = request.form.get("title", "").strip()
    excerpt = request.form.get("excerpt", "").strip()
    body = request.form.get("body", "").strip()
    status = request.form.get("status", "published")

    if len(title) < 5 or len(title) > 150:
        flash("Judul 5–150 karakter.", "error")
    elif not excerpt or len(excerpt) > 250:
        flash("Ringkasan wajib diisi (maksimal 250 karakter).", "error")
    elif len(body) < 20:
        flash("Isi berita minimal 20 karakter.", "error")
    elif status not in NEWS_STATUSES:
        flash("Status tidak valid.", "error")
    else:
        data.add_news(title, excerpt, text_to_html(body), status)
        flash("Berita ditambahkan.", "success")
    return redirect(url_for("admin_dashboard") + "#berita")


@app.post("/admin/berita/<news_id>/hapus")
@login_required
def admin_berita_hapus(news_id):
    if data.delete_news(news_id):
        flash("Berita dihapus.", "success")
    else:
        flash("Berita tidak ditemukan.", "error")
    return redirect(url_for("admin_dashboard") + "#berita")


@app.post("/admin/pendaftaran/<reg_id>/status")
@login_required
def admin_pendaftaran_status(reg_id):
    status = request.form.get("status", "")
    if status not in REG_STATUSES:
        flash("Status tidak valid.", "error")
    elif data.update_registration_status(reg_id, status):
        flash("Status pendaftaran diperbarui.", "success")
    else:
        flash("Data pendaftaran tidak ditemukan.", "error")
    return redirect(url_for("admin_dashboard") + "#pendaftaran")


# ---------------------------------------------------------------------------
# Error
# ---------------------------------------------------------------------------
@app.errorhandler(404)
def not_found(_):
    return render_template("404.html"), 404


if __name__ == "__main__":
    app.run(debug=True)
