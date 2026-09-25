# 🛫 preflight-review

> **Preflight your code before it ships.** An AI developer companion that lives in your terminal —
> review diffs, write commit messages, and triage errors without leaving the shell.

**Language**: **English** | [Bahasa Indonesia](./README.id.md)

[![Made with Atria Dawn Preview](https://img.shields.io/badge/powered%20by-Atria%20Dawn%20Preview-7b5cff)](https://atria-asi.ai)
[![Zero dependencies](https://img.shields.io/badge/dependencies-zero-2ea043)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-0078D4)](#)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`preflight-review` is a small, dependency-free CLI that talks to the [Atria API](https://api.atria-asi.ai/docs).
It works in **any git repo, in any language**, from any shell — PowerShell, bash, zsh, cmd, WSL.

---

## ✨ Features

- 🔍 **`review`** — Senior-level code review of your current diff: bugs, security risks, and concrete fixes.
- 📝 **`commit`** — Three conventional-commit message proposals generated from your staged changes.
- 🩺 **`triage`** — Paste an error log or stack trace, get the likely cause and exact things to check.
- 💬 **`ask`** — A quick technical rubber-duck, with a file as context if you need it.
- ⚡ **Streaming output** — Tokens appear as they're generated, with a live spinner while the model thinks.
- 🧩 **Zero dependencies** — One file, native `fetch`, nothing to break on `npm install`.

---

## 📦 Installation

```bash
git clone https://github.com/znlumins/preflight-review.git
cd preflight-review
npm install -g .
```

Verify it's on your PATH:

```bash
preflight-review --help
```

### 🔐 API key

The CLI reads your Atria API key from the `ATRIA_API_KEY` environment variable.
Create a key in the [Atria console](https://atria-asi.ai/console), then:

**macOS / Linux**
```bash
export ATRIA_API_KEY="atr_xxx"          # add to ~/.zshrc or ~/.bashrc to persist
```

**Windows**
```powershell
setx ATRIA_API_KEY "atr_xxx"            # then reopen your terminal
```

---

## 🚀 Usage

### Review your changes before committing

```bash
preflight-review review
```

By default it reviews staged changes, then unstaged ones, and finally falls back to
comparing against your main branch. Comparing against another branch:

```bash
preflight-review review --base develop
```

<details>
<summary><b>Example output</b></summary>

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

### Generate commit messages

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

### Triage errors

```bash
preflight-review triage error.log
cat error.log | preflight-review triage      # or pipe it in
```

Produces a structured diagnosis: **error utama → kemungkinan penyebab (ranked) → langkah cek/fix**.

<details>
<summary><b>Example output</b></summary>

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

### Ask anything

```bash
preflight-review ask "bagaimana cara kerja JWT refresh token?"
preflight-review ask --file src/auth.py    # attach a file as context
```

---

## ⚙️ Flags

| Flag | Description | Default |
| --- | --- | --- |
| `--base <branch>` | Branch to compare against in `review` | `main` |
| `--file <path>` | Read a file as input (for `ask` / `triage`) | — |
| `--max-diff <n>` | Max characters of diff/log to send | `60000` |
| `-h`, `--help` | Show help | — |

---

## 📝 Notes & limitations

- The underlying model (`Atria-Dawn-Preview`) is **text-only** — send logs, code, and docs as text,
  not screenshots or PDFs.
- The model reasons before answering, so latency varies from a few seconds to over a minute.
  Streaming plus a spinner keeps you informed while it thinks.
- Rate limits are shared across all keys on your account per minute. On HTTP `429`, wait and retry.
- Diffs are truncated at `--max-diff` characters (the model has a 256K context window).

---

## 🧱 How it works

`preflight-review` is a single Node script (>= 18, native `fetch`) that calls the OpenAI-compatible
Chat Completions endpoint at `https://api.atria-asi.ai/v1/chat/completions` with SSE streaming.
Each mode is just a carefully engineered system prompt plus your local `git diff` or pasted text.
No embeddings, no vector DB, no cloud in between — your code goes straight from your machine to the API.

---

## 🤝 Contributing

Issues and PRs are welcome. After editing `bin/preflight-review.js`, reinstall locally to test:

```bash
npm install -g .
```

## 📄 License

[MIT](LICENSE) © 2026 znlumins
