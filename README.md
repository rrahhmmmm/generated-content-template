# Multi-Account Video Content Generator

Satu klip video masuk → sepuluh video keluar, masing-masing sudah menempel overlay template milik tiap akun sosial media, plus caption & teks thumbnail yang sudah di-rewrite oleh LLM biar tidak identik antar akun.

---

## Tech Stack

| Layer | Tech | Kenapa |
|---|---|---|
| Frontend | **Next.js 16 (App Router)** + **React 19** + **TypeScript** | Server Components untuk data fetching, Route Handlers untuk API |
| Styling | **Tailwind CSS v4** + **shadcn/ui** (Radix primitives) | Token-based, komponen accessible out-of-the-box |
| Theme | **next-themes** | Dark/light mode toggle |
| Form | **react-hook-form** + **zod** + **@hookform/resolvers** | Validasi typed, DX bagus |
| Upload | **react-dropzone** | Drag-and-drop file |
| Database | **Prisma 6** + **SQLite** (dev) / **PostgreSQL** (prod) | Relasi Job → Rendition jelas, mudah swap provider |
| Queue | **BullMQ** + **ioredis** (prod) / in-memory queue (dev) | Render lepas dari request lifecycle, in-memory buat zero-config dev |
| Worker | **Node.js standalone** (dijalankan via `tsx`) | FFmpeg butuh binary di filesystem + long-running |
| Video render | **FFmpeg** (binary via `ffmpeg-static`) | Overlay statis = use case inti FFmpeg |
| Thumbnail extract | **FFmpeg** (`signalstats` batch probe + `filter_complex` dual-output) + **dHash 64-bit** | 1 spawn probe + N spawn extract; dedup perseptual tanpa dep image processing baru |
| Font metrics | **opentype.js** | Auto-fit text di canvas overlay |
| LLM | **Vercel AI SDK v7** + `@ai-sdk/google` (Gemini) / `@ai-sdk/anthropic` (Claude) | Multi-provider dengan interface sama, structured output via zod |
| Storage | **Cloudflare R2** (S3-compatible, via `@aws-sdk/client-s3`) / local filesystem | Egress gratis untuk prod, local untuk dev |
| Archive | **archiver** | Bundle 10 rendition jadi 1 ZIP untuk download |
| Testing | **Vitest** | Fast, native ESM |

---

## Overview Penggunaan Tech per Fitur

### 1. Account Management (`/accounts`)
CRUD akun sosial media (TikTok / Instagram / YouTube).

- **UI**: `src/app/accounts/page.tsx` + `add-account-dialog.tsx` — Next.js Server Component untuk list, Radix Dialog + react-hook-form + zod untuk form.
- **API**: `src/app/api/accounts/route.ts`, `[id]/route.ts` — Route Handlers, validasi payload dengan zod, persist via Prisma.
- **DB**: model `Account` di `prisma/schema.prisma` (field `promptStyle` untuk per-akun LLM instruction).

### 2. Template Editor (`/accounts/[id]/template`)
Upload frame PNG + intro PNG per akun, atur posisi teks thumbnail lewat layout JSON.

- **UI**: `src/app/accounts/[id]/template/template-editor.tsx` + `layout-form.tsx` — form terkontrol dengan preview live.
- **Preview canvas**: `src/components/template-editor/preview-canvas.tsx` — HTML Canvas 2D render frame/intro + text overlay real-time.
- **Font fitting**: `src/lib/fit-text.ts` + `src/lib/fonts.ts` / `fonts-client.ts` menggunakan `opentype.js` untuk ukur glyph & auto-shrink font-size supaya muat box.
- **Upload asset**: `src/app/api/uploads/route.ts` → simpan via storage adapter (`src/lib/storage/`).
- **DB**: model `Template` menyimpan `frameKey`, `introKey`, `width`, `height`, dan `layout` (JSON string).

### 3. Prompt Config (`/settings`)
Konfigurasi prompt LLM global + per-platform style.

- **UI**: `src/app/settings/settings-editor.tsx` — form multi-textarea (system prompt + TikTok / Instagram / YouTube style).
- **API**: `src/app/api/prompt-config/route.ts` — Route Handler GET/PUT, upsert singleton row.
- **DB**: model `PromptConfig` (id = `"global"`).
- **Consumer**: `src/lib/llm/prompt.ts` compose system prompt + platform style + `Account.promptStyle` sebelum call LLM.

### 4. Create Job (`/create`)
Upload video + isi caption & thumbnail text dasar → submit ke queue.

- **UI**: `src/app/create/create-form.tsx` — react-hook-form + zod + react-dropzone.
- **Upload video**: `src/app/api/uploads/video/route.ts` streaming ke storage driver (local / R2).
- **Submit**: POST `/api/jobs` (`src/app/api/jobs/route.ts`) — buat 1 `Job` + N `Rendition` (fan-out per akun aktif), enqueue via `src/lib/queue/`.

### 5. Job Queue & Worker
Fan-out render 10 rendition, resilient (1 rendition gagal ≠ job gagal total).

- **Queue abstraction**: `src/lib/queue/index.ts` pilih backend berdasarkan `JOB_QUEUE` env:
  - `memory` → `src/lib/queue/memory.ts` (in-process, zero-config dev)
  - `bullmq` → `src/lib/queue/bullmq.ts` (Redis, prod-ready)
- **Handlers**: `src/lib/queue/handlers.ts` route job type ke processor.
- **Worker standalone**: `scripts/worker.ts` — proses long-lived, dijalankan `pnpm worker`. Panggil `src/lib/worker/process-job.ts` → fan-out ke `process-rendition.ts` per akun.
- **Retry**: `src/app/api/renditions/[id]/retry/route.ts` untuk re-enqueue rendition yang gagal.

### 6. LLM Rewrite (Caption + Thumbnail Text)
Rewrite caption & thumbnail text agar unik per akun & sesuai platform style.

- **Provider abstraction**: `src/lib/llm/index.ts` — factory berdasarkan `LLM_PROVIDER` env:
  - `gemini` → `src/lib/llm/gemini.ts` (`@ai-sdk/google`)
  - `anthropic-gateway` / `anthropic-direct` → `src/lib/llm/anthropic.ts` (`@ai-sdk/anthropic`)
  - `null` → `src/lib/llm/null.ts` (echo, untuk test)
- **Prompt compose**: `src/lib/llm/prompt.ts` gabung system prompt + platform style + `Account.promptStyle`.
- **Structured output**: `generateObject` dari `ai` SDK + zod schema di `src/lib/llm/validation.ts` — hasil dijamin `{ caption, thumbText }`.
- **Boundary**: LLM hanya lihat teks; tidak pernah menerima frame video.

### 7. Video Rendering
Overlay frame full-duration + intro card 0–5 detik + drawtext thumbnail.

- **Runner**: `src/lib/render/index.ts` build FFmpeg command dari `Template.layout` + text hasil LLM.
- **Filter graph**: `src/lib/render/filter.ts` compose filter_complex FFmpeg (scale/pad video, overlay frame, overlay intro dengan `enable='between(t,0,5)'`, drawtext dengan font metrics dari opentype.js).
- **Binary**: `ffmpeg-static` (bundled, tidak perlu install di host).
- **Ad-hoc render**: `scripts/render.ts` untuk debug tanpa worker.

### 8. Job Monitoring (`/jobs`, `/jobs/[id]`)
List job + detail per rendition + download.

- **List**: `src/app/jobs/page.tsx` + `/api/jobs/list` — paginated, status badge (`src/components/status-badge.tsx`).
- **Detail**: `src/app/jobs/[id]/job-detail.tsx` polling status rendition, tombol retry per rendition.
- **Download bundle**: `src/app/api/jobs/[id]/download/route.ts` — stream ZIP via `archiver` berisi 10 video + caption `.txt`.

### 9. Storage Layer
Abstraksi supaya sama-sama jalan di dev (filesystem) & prod (R2).

- **Interface**: `src/lib/storage/index.ts` — `put`, `get`, `getSignedUrl`, `remove`.
- **Adapter**:
  - `local.ts` → filesystem `./storage`, di-serve via `src/app/api/uploads/local/[...path]/route.ts`.
  - `r2.ts` → Cloudflare R2 via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (S3-compatible).
- **Switch**: `STORAGE_DRIVER=local|r2` di env.

### 11. Auto-Generate Thumbnail per Account
Ekstrak N frame unik dari 1 video sumber → thumbnail berbeda per akun, dengan dedup perseptual supaya video statis (talking head, slide) tetap menghasilkan thumbnail unik antar akun. Menghindari deteksi konten duplikat oleh platform.

- **Distribusi timestamp**: `src/lib/thumbnails/distribute.ts` bagi merata (min interval 0.3s, clamp + warning kalau durasi < N × min).
- **Batch brightness probe**: `src/lib/thumbnails/probe.ts` — 1 FFmpeg spawn sample seluruh video via `fps=1/0.5,signalstats,metadata=print`. Threshold adaptif dari p25 sampling (floor 20, `0.7 × p25`), tidak hardcoded.
- **Extract + hash combined**: `src/lib/thumbnails/extract.ts` — `filter_complex` dual-output: [thumb JPG] + [9×8 grayscale pipe:1] → dHash 64-bit dihitung langsung dari 72 raw bytes. Zero image-processing dep.
- **Perseptual dedup**: `src/lib/thumbnails/dedup.ts` — Hamming distance pairwise (threshold 10). Kalau collision: walk ke kandidat brightMap layak, rehash (max 5×). Sisa collision → flag `similar: true` (warning badge, bukan fail).
- **Async task**: POST `/api/thumbnails/generate` return `{ taskId }` langsung. Worker (queue existing) eksekusi via handler baru `"thumbnail-generation"`. State di Prisma `ThumbnailTask`. UI poll GET `/api/thumbnails/generate/[taskId]` tiap 1s.
- **Override manual**: `src/app/create/thumbnail-preview.tsx` grid card per akun; `FileDropzone` inline → POST `/api/thumbnails/upload`. Partial override diperbolehkan.
- **Aspect ratio**: match `Template.width/height` per akun (fallback `PLATFORM_ASPECT` di `src/lib/platforms.ts`).
- **Non-blocking submit**: Submit selalu boleh tanpa tunggu generate. Worker rendition fallback ke behavior lama (extract detik 2 dari output) untuk akun tanpa `thumbnailKey`.
- **Path & cleanup**: Preview di `thumbnails/preview/{taskId}/{accountId}_{w}x{h}.jpg`; saat submit di-copy ke `renditions/pre/{jobId}/{renditionId}/thumb.jpg`. Preview auto-expire 7 hari via R2 lifecycle (`docs/r2-lifecycle.json`) atau `pnpm cleanup-thumbnails` (local).
- **Download bundle**: `{handle}_thumb.jpg` masuk ZIP di `/api/jobs/[id]/download`.
- **Composite thumbnail + Cover embed** (Fase 6): worker post-render melakukan 2 langkah:
  1. `src/lib/render/composite-thumbnail.ts` — apply frame PNG + intro card + drawtext ke raw thumbnail (single-frame FFmpeg reuse `buildFilterComplex` yang sama dengan render video). Hasilnya = image dengan branding style sama seperti frame video di detik 0-5, TAPI background pakai frame video unik per akun.
  2. `src/lib/render/embed-cover.ts` — prepend composite thumbnail sebagai first frame video (~150ms) via `filter_complex concat + anullsrc`. Instagram/Reels default pick frame 0 sebagai cover → thumbnail unik + branded otomatis terpakai di feed tanpa user pilih manual.

  Composite juga disimpan sebagai `Rendition.thumbnailKey` final → download bundle & job detail UI show versi ter-branded (bukan raw). Toggle: `EMBED_COVER_FRAME=false` untuk disable, `COVER_FRAME_DURATION_SEC=0.15` untuk tuning.

Spawn budget per task (10 akun): 1 batch probe + 10 extract+hash + ≤5 dedup walk = **≤16 spawn**. Ditambah 1 encode pass per rendition untuk cover embed (opt-out via env).

### 12. UI Component Library
- `src/components/ui/` — komponen shadcn/ui (button, card, dialog, input, label, progress, select, skeleton, textarea, badge) di atas Radix.
- `src/components/app-shell.tsx` — layout global.
- `src/components/theme-provider.tsx` + `theme-toggle.tsx` — next-themes.
- `src/components/file-dropzone.tsx` — wrapper react-dropzone.
- `src/app/kitchen-sink/page.tsx` — halaman preview semua komponen.

---

## Menjalankan Lokal

```bash
pnpm install
cp .env.example .env.local     # sesuaikan
pnpm db:push                   # sync Prisma → SQLite dev.db
pnpm fonts:fetch               # download 16 curated Google Fonts → public/fonts/
pnpm dev                       # Next.js di :3000
pnpm worker                    # (di terminal terpisah, kalau JOB_QUEUE=bullmq)
```

> Font TTF di-commit ke repo, jadi `pnpm fonts:fetch` cukup dijalankan sekali saat fresh clone (atau setiap kali kamu menambah entry baru di `src/lib/font-catalog.ts` + `scripts/fetch-fonts.ts`).

Env penting (`.env.example`):
- `DATABASE_URL` — Prisma
- `STORAGE_DRIVER` — `local` | `r2`
- `JOB_QUEUE` — `memory` | `bullmq` (butuh `REDIS_URL`)
- `LLM_PROVIDER` — `gemini` | `anthropic-gateway` | `anthropic-direct` + API key masing-masing
- `SESSION_PASSWORD` — 32+ karakter random untuk enkripsi cookie iron-session. Generate: `openssl rand -base64 48`. **Wajib** — server tidak start tanpa ini.
- `SESSION_COOKIE_NAME` — default `genc_session`

## Bootstrap Admin Pertama

Setelah `pnpm db:push`, tabel `User` kosong. Buat admin pertama manual (tidak ada seed script otomatis by design):

```bash
# 1. Generate bcrypt hash untuk password admin (ganti PASSWORD_ANDA)
node -e "console.log(require('bcryptjs').hashSync('PASSWORD_ANDA', 10))"
# Output contoh: $2a$10$abc...

# 2a. SQLite dev (default)
sqlite3 prisma/dev.db "INSERT INTO User (id, email, passwordHash, name, role, status, createdAt, updatedAt) VALUES ('admin_seed_1', 'admin@example.com', '<PASTE_HASH>', 'Admin', 'ADMIN', 'ACTIVE', datetime('now'), datetime('now'));"

# 2b. Postgres produksi
psql $DATABASE_URL -c "INSERT INTO \"User\" (id, email, \"passwordHash\", name, role, status, \"createdAt\", \"updatedAt\") VALUES ('admin_seed_1', 'admin@example.com', '<PASTE_HASH>', 'Admin', 'ADMIN', 'ACTIVE', NOW(), NOW());"
```

Login di `/login` dengan email + password tsb. User berikutnya bisa register via `/register` (default status `PENDING`) — admin approve di `/admin/users`.

## Scripts

| Command | Fungsi |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Build & serve produksi |
| `pnpm worker` | Jalankan worker BullMQ (long-lived) |
| `pnpm submit-job` | Submit job dari CLI (debug) |
| `pnpm render` | Render satu video ad-hoc (debug FFmpeg pipeline) |
| `pnpm db:push` / `db:migrate` / `db:studio` | Prisma workflow |
| `pnpm fonts:fetch` | Download curated Google Fonts ke `public/fonts/` (idempoten, `--force` untuk overwrite) |
| `pnpm cleanup-thumbnails` | Hapus file preview/uploaded thumbnail lokal yang mtime > 7 hari (jalankan via cron di prod-lite) |
| `pnpm test` | Vitest |
