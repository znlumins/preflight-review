# 🛫 preflight-review

> **Cek kode kamu sebelum di-ship.** Asisten AI developer yang tinggal di terminal —
> review diff, tulis commit message, dan diagnosa error tanpa keluar dari shell.

**Bahasa**: [English](./README.md) | **Bahasa Indonesia**

[![Zero dependencies](https://img.shields.io/badge/dependencies-zero-2ea043)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D4)](#)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`preflight-review` adalah CLI tanpa dependensi yang terhubung ke [Atria API](https://api.atria-asi.ai/docs).
Bisa dipakai di **repo git apa pun, bahasa apa pun**, dari shell mana pun — PowerShell, bash, zsh, cmd, WSL.

---

## ✨ Fitur

- 🔍 **`review`** — Review perubahan diff kamu ala senior developer: bug, risiko keamanan, dan saran perbaikan konkrit.
- 📝 **`commit`** — Tiga usulan pesan commit Conventional Commits dari perubahan yang sudah di-stage.
- 🩺 **`triage`** — Tempel log error atau stack trace, dapatkan kemungkinan penyebab dan langkah pemeriksaan yang tepat.
- 💬 **`ask`** — Rubber duck teknis untuk tanya cepat, bisa melampirkan file sebagai konteks.
- ⚡ **Output streaming** — Token muncul begitu dihasilkan, lengkap dengan spinner selama model berpikir.
- 🧩 **Tanpa dependensi** — Satu file, pakai `fetch` bawaan Node, tidak ada yang bisa rusak saat `npm install`.

---

## 📦 Instalasi

```bash
npm install -g preflight-review
```

Pastikan sudah masuk PATH:

```bash
preflight-review --help
```

<details>
<summary><b>Install dari source sebagai gantinya</b></summary>

```bash
git clone https://github.com/znlumins/preflight-review.git
cd preflight-review
npm install -g .
```

</details>

<details>
<summary><b>Install dari GitHub Packages sebagai gantinya</b></summary>

```bash
npm config set @znlumins:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken <pat-github-kamu>   # PAT dengan scope read:packages
npm install -g @znlumins/preflight-review
```

Command-nya tetap sama — hanya nama package yang di-scope ke `@znlumins`.

</details>

### 🔐 API key

CLI membaca API key Atria dari environment variable `ATRIA_API_KEY`.
Buat key di [console Atria](https://atria-asi.ai/console), lalu:

> **Catatan:** tool ini hanya kompatibel dengan **API key Atria** — dia cuma terhubung ke Atria API.
> Key dari OpenAI, Anthropic, Google, atau provider lain **tidak** bisa dipakai.

**macOS / Linux**
```bash
export ATRIA_API_KEY="atr_xxx"          # tambahkan ke ~/.zshrc atau ~/.bashrc untuk permanen
```

**Windows**
```powershell
setx ATRIA_API_KEY "atr_xxx"            # lalu buka ulang terminal
```

---

## 🚀 Cara pakai

### Review perubahan sebelum commit

```bash
preflight-review review
```

Prioritasnya: perubahan staged → unstaged → membandingkan dengan branch `main`.
Mau bandingkan dengan branch lain:

```bash
preflight-review review --base develop
```

<details>
<summary><b>Contoh output</b></summary>

```markdown
# Review: `config.js`

## 1. Potensi bug / error
- tidak ada (kode hanya mendeklarasikan variabel string)

## 2. Risiko keamanan / data
- **Kredensial hardcode** (`pwd = "admin123"`) tersimpan di repo. Secret tercommit = bocor
  permanen di history git; siapa pun yang punya akses repo langsung punya password.

## 3. Saran perbaikan
- Ganti ke environment variable: `const pwd = process.env.APP_PASSWORD;`
- Rotasi password "admin123" sekarang juga — menghapus baris tidak menghapusnya dari history.

## 4. Yang sudah bagus
- Struktur file sederhana dan mudah dibaca.
```

</details>

### Bikin commit message

```bash
git add .
preflight-review commit
```

```text
Usulan commit message:

1. feat(auth): add login endpoint with JWT session
2. feat(api): implement POST /login returning access token
3. feat(auth): create login route for session management

Kalau sudah fix, contoh pakainya:
  git commit -m "<pilih salah satu>"
```

### Diagnosa error

```bash
preflight-review triage error.log
cat error.log | preflight-review triage      # atau lewat pipeline
```

Menghasilkan diagnosis terstruktur: **error utama → kemungkinan penyebab (urut kemungkinan) → langkah cek/fix**.

<details>
<summary><b>Contoh output</b></summary>

```markdown
## Diagnosis Error

### 1. Error utama
Aplikasi gagal melakukan koneksi ke PostgreSQL: "Connection refused" pada
localhost:5432 — tidak ada proses server yang menerima koneksi TCP.

### 2. Kemungkinan penyebab (urut paling mungkin)
1. Server PostgreSQL belum dijalankan.
2. PostgreSQL berjalan di port lain (mis. 5433).
3. Aplikasi di container: `localhost` merujuk ke container itu sendiri.

### 3. Langkah cek/fix
- `systemctl status postgresql` / `docker ps`
- Cek port yang listen: `ss -tlnp | grep 5432`
- Verifikasi nilai `DB_URL` (host & port).
```

</details>

### Tanya apa saja

```bash
preflight-review ask "bagaimana cara kerja JWT refresh token?"
preflight-review ask --file src/auth.py    # lampirkan file sebagai konteks
```

---

## ⚙️ Flag

| Flag | Keterangan | Default |
| --- | --- | --- |
| `--base <branch>` | Branch pembanding untuk `review` | `main` |
| `--file <path>` | Baca file sebagai input (untuk `ask` / `triage`) | — |
| `--max-diff <n>` | Batas karakter diff/log yang dikirim | `60000` |
| `-h`, `--help` | Tampilkan bantuan | — |

---

## 📝 Catatan & keterbatasan

- Model yang dipakai (`Atria-Dawn-Preview`) **hanya menerima teks** — kirim log, kode, dan dokumen sebagai teks,
  bukan screenshot atau PDF.
- Model berpikir (reasoning) sebelum menjawab, jadi latensi bisa dari beberapa detik sampai lebih dari satu menit.
  Streaming dan spinner membantu kamu tahu bahwa proses sedang berjalan.
- Token reasoning ikut dihitung dalam budget output. CLI memakai budget 16.384 token agar reasoning
  tidak menghabiskan seluruh jawaban; kalau tetap terpotong, akan ada peringatan, bukan diam saja.
- Rate limit dibagikan per menit untuk semua key di akunmu. Kalau dapat HTTP `429`, tunggu sebentar lalu coba lagi.
- Diff dipotong otomatis sesuai `--max-diff` karakter (context window model 256K).

---

## 🧱 Cara kerjanya

`preflight-review` adalah satu file Node (>= 18, `fetch` bawaan) yang memanggil endpoint Chat Completions
yang kompatibel dengan OpenAI di `https://api.atria-asi.ai/v1/chat/completions` dengan SSE streaming.
Tiap mode pada dasarnya adalah system prompt yang dirancang hati-hati plus `git diff` lokal atau teks yang kamu tempel.
Tanpa embedding, tanpa vector DB, tanpa perantara cloud — kodemu langsung dari mesinmu ke API.

---

## 🤝 Kontribusi

Issue dan PR sangat diterima. Setelah mengedit `bin/preflight-review.js`, install ulang untuk tes:

```bash
npm install -g .
```

## 📄 Lisensi

[MIT](LICENSE) © 2026 znlumins
