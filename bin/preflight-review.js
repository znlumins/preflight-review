#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, readSync, fstatSync } from "node:fs";
import { argv, exit, stdin, stdout } from "node:process";

const ENDPOINT = "https://api.atria-asi.ai/v1/chat/completions";
const MODEL = "Atria-Dawn-Preview";
const DEFAULT_MAX_DIFF = 60000;

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

function help() {
  console.log(`
${C.bold}preflight-review${C.reset} — asisten harian developer via Atria API

${C.bold}CARA PAKAI${C.reset}
  ${C.cyan}preflight-review review${C.reset}                  Review perubahan (staged > unstaged > vs branch pembanding)
  ${C.cyan}preflight-review review --base develop${C.reset}   Bandingkan HEAD dengan branch 'develop'
  ${C.cyan}preflight-review commit${C.reset}                  Usulkan conventional commit message dari staged diff
  ${C.cyan}preflight-review triage error.log${C.reset}        Diagnosa file log/error
  ${C.cyan}cat error.log | preflight-review triage${C.reset}  Diagnosa dari pipeline/stdin
  ${C.cyan}preflight-review ask "bagaimana JWT refresh?"${C.reset}   Tanya / rubber-duck
  ${C.cyan}preflight-review ask --file src/auth.py${C.reset}  Tanya dengan isi file sebagai konteks

${C.bold}FLAG${C.reset}
  --base <branch>    Branch pembanding untuk review (default: main)
  --file <path>      Baca isi file sebagai input
  --max-diff <n>     Batas karakter diff (default: ${DEFAULT_MAX_DIFF})

${C.bold}CATATAN${C.reset}
  Butuh env var ${C.cyan}ATRIA_API_KEY${C.reset} (sudah diset di Windows).
  Model text-only: kirim log/kode sebagai teks, bukan screenshot.
`);
}

function parseArgs() {
  const [cmd, ...rest] = argv.slice(2);
  const opts = { base: "main", file: null, maxDiff: DEFAULT_MAX_DIFF, positional: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--base") opts.base = rest[++i];
    else if (a === "--file") opts.file = rest[++i];
    else if (a === "--max-diff") opts.maxDiff = parseInt(rest[++i], 10);
    else if (a === "-h" || a === "--help" || a === "help") opts.help = true;
    else if (a.startsWith("--")) {
      console.error(`${C.red}Flag tidak dikenal:${C.reset} ${a}\nJalankan ${C.cyan}preflight-review --help${C.reset}`);
      exit(1);
    } else opts.positional.push(a);
  }
  return { cmd, opts };
}

function git(...args) {
  const r = spawnSync("git", args, { encoding: "utf8", shell: false });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim();
}

function getApiKey() {
  const key = process.env.ATRIA_API_KEY;
  if (!key) {
    console.error(
      `${C.red}ATRIA_API_KEY belum diset.${C.reset}\n` +
        `Jalankan: ${C.cyan}setx ATRIA_API_KEY "atr_xxx"${C.reset} lalu buka terminal baru.`
    );
    exit(1);
  }
  return key;
}

function clearLine() {
  stdout.write("\r\x1b[K");
}

async function sendAtria(system, user, maxTokens = 4096) {
  const body = {
    model: MODEL,
    max_completion_tokens: maxTokens,
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`${C.red}Gagal terhubung ke Atria API:${C.reset} ${e.message}`);
    exit(1);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error?.message || JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => "");
    }
    const hint =
      res.status === 401
        ? "\nCek apakah API key masih valid (bisa dibuat ulang di console Atria)."
        : res.status === 429
        ? "\nKena rate limit. Tunggu sebentar lalu coba lagi."
        : "";
    console.error(`${C.red}Atria API ${res.status}:${C.reset} ${detail}${hint}`);
    exit(1);
  }

  // streaming SSE: tampilkan token begitu datang, spinner sambil menunggu
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = 0;
  const started = Date.now();
  let spinnerTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - started) / 1000);
    stdout.write(`\r${C.cyan}${frames[frame++ % frames.length]}${C.reset} ${C.dim}menunggu respons Atria... ${secs}s${C.reset}`);
  }, 120);

  let buffer = "";
  let out = "";
  let first = true;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) {
          if (first) {
            clearInterval(spinnerTimer);
            clearLine();
            first = false;
          }
          out += delta;
          stdout.write(delta);
        }
      }
    }
  } finally {
    if (spinnerTimer) clearInterval(spinnerTimer);
  }
  if (first) clearLine(); // tidak ada token sama sekali
  if (out) stdout.write("\n");
  return out;
}

function truncate(text, limit) {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n[...truncated, lebih panjang dari ${limit} chars...]`;
}

function readStdinSync() {
  // baca stdin hanya kalau di-redirect (bukan TTY), supaya tidak nge-hang
  try {
    if (stdin.isTTY) return null;
  } catch {
    return null;
  }
  try {
    const fd = fstatSync(stdin.fd);
    if (!fd.isCharacterDevice()) {
      let out = "";
      const buf = Buffer.alloc(65536);
      while (true) {
        const n = readSync(stdin.fd, buf, 0, buf.length, null);
        if (n === 0) break;
        out += buf.slice(0, n).toString("utf8");
      }
      return out;
    }
  } catch {
    return null;
  }
  return null;
}

function readInput(opts, { asFile = false } = {}) {
  if (opts.positional.length) {
    if (asFile) return readFileOrThrow(opts.positional[0]);
    return opts.positional.join(" ");
  }
  if (opts.file) return readFileOrThrow(opts.file);
  const piped = readStdinSync();
  if (piped && piped.trim()) return piped;
  if (asFile !== undefined) {
    console.error(`${C.red}Input kosong. Berikan path file, teks, --file, atau pipeline.${C.reset}`);
    exit(1);
  }
  return null;
}

function readFileOrThrow(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`${C.red}File tidak ditemukan / tidak bisa dibaca:${C.reset} ${path}`);
    exit(1);
  }
}

function getDiff(opts) {
  // prioritas: staged > unstaged > vs branch pembanding
  let diff = git("diff", "--cached", "--no-color");
  let vsBase = false;
  if (!diff) diff = git("diff", "--no-color");
  if (!diff) {
    if (!git("rev-parse", "--verify", "HEAD")) return null;
    diff = git("diff", `${opts.base}...HEAD`, "--no-color");
    vsBase = true;
  }
  if (!diff) return null;
  return { diff, vsBase };
}

async function review(opts) {
  const got = getDiff(opts);
  if (!got) {
    console.log(`${C.yellow}Tidak ada perubahan untuk direview.${C.reset}`);
    return;
  }
  const diff = truncate(got.diff, opts.maxDiff);
  if (got.vsBase) console.log(`${C.dim}>> tidak ada perubahan lokal, membandingkan dengan '${opts.base}'...${C.reset}`);
  const system = `Kamu adalah senior code reviewer yang to-the-point. Analisis diff yang diberikan.
Berikan output singkat dalam Markdown dengan struktur:
1. **Potensi bug / error** (urut paling kritis; tulis "tidak ada" bila aman)
2. **Risiko keamanan / data** (mis. input tidak divalidasi, secret bocor)
3. **Saran perbaikan** (perubahan kecil dengan alasan)
4. **Yang sudah bagus** (1-2 poin saja)
Fokus pada benar/salah dan risiko, bukan gaya penulisan. Jangan ulas baris yang hanya dipindah.`;
  const out = await sendAtria(system, `Review diff ini:\n\n\`\`\`diff\n${diff}\n\`\`\``);
  if (!out) console.log(`${C.yellow}(respons kosong)${C.reset}`);
}

async function commitMsg(opts) {
  const diff = git("diff", "--cached", "--no-color");
  if (!diff) {
    console.log(`${C.yellow}Belum ada perubahan yang di-stage. Jalankan:${C.reset} git add <file>`);
    return;
  }
  const system = `Buatkan pesan commit Conventional Commits (bahasa Inggris, ringkas) berdasarkan diff.
Format: \`<type>(<scope>): <subjek singkat>\` lalu 1 baris kosong lalu 1-3 baris body opsional.
type: feat, fix, refactor, perf, docs, test, chore, style, ci.
Keluarkan 3 alternatif subjek berbeda (bukan 3 versi sama), tanpa penjelasan tambahan.`;
  console.log(`\n${C.cyan}Usulan commit message:${C.reset}\n`);
  const out = await sendAtria(system, `Diff staged:\n\n\`\`\`diff\n${truncate(diff, opts.maxDiff)}\n\`\`\``);
  if (!out) console.log(`${C.yellow}(respons kosong)${C.reset}`);
  console.log(`\n${C.dim}Kalau sudah fix, contoh pakainya:${C.reset}\n  git commit -m "<pilih salah satu>"`);
}

async function triage(opts) {
  const content = readInput(opts, { asFile: true });
  if (!content || !content.trim()) {
    console.error(`${C.red}Isi input kosong.${C.reset}`);
    exit(1);
  }
  const system = `Kamu adalah ahli debugging. Berdasarkan log/trace error, berikan diagnosis singkat dalam Markdown:
1. **Error utama** (apa yang gagal, 1-2 kalimat)
2. **Kemungkinan penyebab** (urut paling mungkin, dengan alasan singkat dari bukti di log)
3. **Langkah cek/fix** (konkret: file/konfigurasi/perintah yang harus diperiksa)
Jangan menebak tanpa dasar; kalau log kurang jelas, sebutkan info tambahan apa yang dibutuhkan.`;
  const out = await sendAtria(
    system,
    `Berikut log/trace error:\n\n\`\`\`log\n${truncate(content, opts.maxDiff)}\n\`\`\``
  );
  if (!out) console.log(`${C.yellow}(respons kosong)${C.reset}`);
}

async function ask(opts) {
  const question = readInput(opts, { asFile: false });
  if (!question) {
    console.error(`${C.red}Pertanyaan kosong.${C.reset} Contoh: preflight-review ask "apa itu OAuth2?"`);
    exit(1);
  }
  const system = `Jawab sebagai asisten teknis. Ringkas, langsung ke poin, kode disertai penjelasan singkat.`;
  const out = await sendAtria(system, question);
  if (!out) console.log(`${C.yellow}(respons kosong)${C.reset}`);
}

async function main() {
  const { cmd, opts } = parseArgs();
  if (!cmd || opts.help || cmd === "help" || cmd === "-h" || cmd === "--help") return help();
  switch (cmd) {
    case "review": return review(opts);
    case "commit": return commitMsg(opts);
    case "triage": return triage(opts);
    case "ask": return ask(opts);
    default:
      console.error(`${C.red}Perintah tidak dikenal:${C.reset} ${cmd}\nJalankan ${C.cyan}preflight-review --help${C.reset}`);
      exit(1);
  }
}

main().catch((e) => {
  console.error(`${C.red}Error:${C.reset} ${e?.message ?? e}`);
  exit(1);
});
