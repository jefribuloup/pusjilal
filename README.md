# Pusjilal Web — Prototype (Flask)

Prototype website **Pusat Kajian dan Advokasi Halal (Pusjilal)** untuk dipresentasikan ke klien: website kelembagaan, pendaftaran kegiatan, dan arsip jurnal.

Dibuat dengan **Flask + HTML (Jinja2)** dan struktur sederhana. Aturan kecil di bawah menjaga agar nanti mudah dipindah ke **Next.js**.

---

## Fitur prototype

Memakai **data contoh (dummy)** agar bisa didemokan tanpa database.

- [ ] Halaman publik: beranda, profil, layanan, berita (+ detail), kontak
- [ ] Pendaftaran kegiatan: formulir per program (mis. Penyelia Halal, Juru Sembelih Halal)
- [ ] Arsip jurnal: daftar volume/edisi, detail, unduh PDF
- [ ] Admin: login, kelola berita, lihat data pendaftaran

> Centang sesuai kondisi prototype.

---

## Struktur folder

```
pusjilal-web/
├── app.py              # semua route (publik + admin)
├── data.py             # satu-satunya tempat baca/tulis data
├── data/
│   └── seed.json       # data contoh: berita, program, jurnal, pendaftaran
├── templates/
│   ├── base.html       # layout utama
│   ├── components/     # navbar.html, footer.html, news_card.html
│   ├── index.html
│   ├── profil.html
│   ├── layanan.html
│   ├── berita.html
│   ├── berita_detail.html
│   ├── kontak.html
│   ├── pendaftaran.html
│   ├── jurnal.html
│   └── admin/          # login.html, dashboard.html
├── static/
│   ├── css/
│   ├── img/
│   └── uploads/        # unggahan (hanya untuk prototype)
├── requirements.txt
├── .env.example
└── README.md
```

---

## Menjalankan

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
flask --app app run --debug
```

Buka `http://127.0.0.1:5000`.

`.env.example`:

```env
SECRET_KEY=ganti-dengan-string-acak
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=
```

---

## Aturan agar mudah dipindah ke Next.js

Hanya lima aturan, cukup untuk tahap prototype:

1. **Akses data hanya lewat `data.py`.** Route dan template tidak membaca `seed.json` langsung. Nanti isi `data.py` diganti database atau API tanpa mengubah route.
2. **Template hanya menampilkan data.** Format tanggal, slug, dan hitungan dikerjakan di Python, bukan di Jinja.
3. **Bagian UI yang berulang masuk `components/`.** Satu file = satu komponen React nantinya, dengan parameter eksplisit.
4. **Nama field data tetap dan konsisten** (lihat bagian Data). Nama yang sama dipakai di tipe TypeScript.
5. **URL stabil dan konfigurasi dari `.env`.** Tidak ada kunci atau nilai konfigurasi di kode.

---

## Data

Contoh bentuk data di `seed.json` (nama field jangan diubah):

```json
{
  "news": [
    { "id": "1", "slug": "pelatihan-penyelia-halal", "title": "...", "excerpt": "...",
      "body_html": "...", "published_at": "2026-10-01T00:00:00Z", "status": "published" }
  ],
  "programs": [
    { "id": "1", "slug": "penyelia-halal", "name": "Pelatihan Penyelia Halal",
      "description": "...", "quota": 30, "is_open": true }
  ],
  "registrations": [
    { "id": "1", "program_id": "1", "full_name": "...", "email": "...",
      "phone": "...", "status": "menunggu", "created_at": "2026-10-05T00:00:00Z" }
  ],
  "journal_issues": [
    { "id": "1", "volume": 1, "number": 1, "year": 2026, "articles": [
      { "title": "...", "authors": ["..."], "abstract": "...", "pdf": "static/uploads/..." } ] }
  ]
}
```

Tanggal memakai ISO 8601 dan `id` berupa string.

---

## Padanan Flask → Next.js

| Flask | Next.js (App Router) |
|---|---|
| `app.py` (route publik) | `app/**/page.tsx` |
| `templates/base.html` | `app/layout.tsx` |
| `templates/components/*.html` | `components/*.tsx` |
| `templates/admin/*` | `app/admin/**` + `middleware.ts` |
| `data.py` | `lib/data.ts` |
| `static/` | `public/` |
| `.env` | `.env.local` |
| `/berita/<slug>` | `app/berita/[slug]/page.tsx` |
| `/pendaftaran/<program>` | `app/pendaftaran/[program]/page.tsx` |

---

## Catatan prototype

- Data contoh, unggahan lokal, dan login admin sederhana **hanya untuk demo**. Jangan dipakai untuk data asli peserta.
- Sebelum dipakai produksi: ganti penyimpanan data (database atau Sheets), pindahkan unggahan ke storage eksternal, tambahkan proteksi CSRF, validasi unggahan, dan batas percobaan login.
- Bila fitur bertambah, pecah `app.py` menjadi `routes/` dan `services/`. Pola `data.py` sudah menyiapkan lapisan data.
- Di Vercel, filesystem bersifat read-only: unggahan harus ke Blob/Drive, bukan `static/uploads/`.
