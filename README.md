# Multi-Account Video Content Generator

Satu klip video masuk → sepuluh video keluar, masing-masing sudah menempel overlay template milik tiap akun sosial media, plus caption & teks thumbnail yang **dibuat / ditulis ulang** oleh LLM per akun (mengikuti systemPrompt global + platform style + `Account.promptStyle`) biar tidak identik antar akun.

User bisa pilih salah satu cara isi teks saat submit:

1. **Description-only** — tulis deskripsi video komprehensif; LLM yang bikin caption + thumbnail text.
2. **Caption + thumbnail manual** — tulis caption dan thumbnail text sendiri; LLM tetap menulis ulang per akun agar variatif.

---

## Tech Stack

| Layer | Tech | Kenapa |
|---|---|---|
| Frontend | **Next.js 16 (App Router)** + **React 19** + **TypeScript** | Server Components untuk data fetching, Route Handlers untuk API |
| Styling | **Tailwind CSS v4** + **shadcn/ui** (Radix primitives) | Token-based, komponen accessible out-of-the-box |
| Theme | **next-themes** | Dark/light mode toggle |
| Form | **react-hook-form** + **zod** + **@hookform/resolvers** | Validasi typed, DX bagus |
| Upload | **react-dropzone** | Drag-and-drop file |
| Database | **Prisma 6** + **PostgreSQL** (dev & prod, `datasource db { provider = "postgresql" }`) | Relasi Job → Rendition jelas; kolom teks bebas ukuran |
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
Upload video + pilih mode input teks → submit ke queue.

- **UI**: `src/app/create/create-form.tsx` — toggle **Deskripsi (auto-generate) ↔ Manual (caption + thumbnail)**. Mode default = deskripsi.
- **Mode "description"**: satu textarea "Deskripsi video (komprehensif)", min 20 karakter — LLM men-*generate* caption + thumbText per akun.
- **Mode "manual"**: dua field caption + thumbnail text; counter kata untuk thumb (batas global 90 kata) — LLM me-*rewrite* per akun.
- **Upload video**: `src/app/api/uploads/video/route.ts` streaming ke storage driver (local / R2). Upload auto-start di background saat file dipilih, supaya `sourceKey` siap saat submit.
- **Submit**: POST `/api/jobs` (`src/app/api/jobs/route.ts`) — Zod `superRefine` memvalidasi XOR (harus salah satu, tidak boleh dua-duanya, tidak boleh kosong). Buat 1 `Job` + N `Rendition` fan-out per akun aktif (dalam satu `$transaction`), enqueue via `src/lib/queue/`.

### 5. Job Queue & Worker
Fan-out render 10 rendition, resilient (1 rendition gagal ≠ job gagal total).

- **Queue abstraction**: `src/lib/queue/index.ts` pilih backend berdasarkan `JOB_QUEUE` env:
  - `memory` → `src/lib/queue/memory.ts` (in-process, zero-config dev)
  - `bullmq` → `src/lib/queue/bullmq.ts` (Redis, prod-ready)
- **Handlers**: `src/lib/queue/handlers.ts` route job type ke processor.
- **Worker standalone**: `scripts/worker.ts` — proses long-lived, dijalankan `pnpm worker`. Panggil `src/lib/worker/process-job.ts` → fan-out ke `process-rendition.ts` per akun.
- **Retry**: `src/app/api/renditions/[id]/retry/route.ts` untuk re-enqueue rendition yang gagal.

### 6. LLM Generate / Rewrite (Caption + Thumbnail Text)
Satu panggilan per Job (bukan per rendition) — hemat biaya + jamin variasi antar akun karena model melihat semua akun sekaligus.

- **Dua mode** (`RewriteBatchInput` discriminated union di `src/lib/llm/index.ts`):
  - `mode: "generate"` — dipicu kalau `Job.description` terisi. LLM membuat caption + thumbText dari deskripsi + systemPrompt + platform style + `Account.promptStyle`.
  - `mode: "rewrite"` — dipicu kalau `Job.baseCaption` + `baseThumbText` terisi. LLM menulis ulang teks user per akun (perilaku lama, tetap didukung).
- **Provider abstraction**: `src/lib/llm/index.ts` — factory berdasarkan `LLM_PROVIDER` env:
  - `gemini` → `src/lib/llm/gemini.ts` (`@ai-sdk/google`)
  - `anthropic-gateway` / `anthropic-direct` → `src/lib/llm/anthropic.ts` (`@ai-sdk/anthropic`)
  - `null` → `src/lib/llm/null.ts` (no-op, dipakai untuk test dan fallback otomatis kalau init provider gagal)
- **Prompt compose**: `src/lib/llm/prompt.ts` gabung systemPrompt + platform style + `Account.promptStyle`. User message bercabang per mode (deskripsi vs caption asli).
- **Structured output**: `generateObject` dari `ai` SDK + Zod schema. Semua provider menjamin output `{ results: [{ accountId, caption, thumbText }] }`.
- **Validasi (`src/lib/llm/validation.ts`)** — `validateAndFallback` return per akun `{ ok: true, caption, thumbText, fellBack } | { ok: false, reason }`:
  - `caption` non-empty, `thumbText` non-empty
  - `countWords(thumbText) ≤ 90` — batas kata **global** (menggantikan `Template.maxThumbChars`). Over → truncate word-boundary.
- **Fallback per mode** (`src/lib/worker/process-job.ts`):
  - Mode generate → invalid → **rendition FAILED** (tidak ada teks user untuk fallback). Provider `null` di mode ini juga otomatis mem-FAIL semua rendition.
  - Mode rewrite → invalid → fallback ke `baseCaption` / `baseThumbText` (dengan truncate 90 kata) supaya render tetap jalan.
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

### 10. Auto-Generate Thumbnail per Account
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

### 11. UI Component Library
- `src/components/ui/` — komponen shadcn/ui (button, card, dialog, input, label, progress, select, skeleton, textarea, badge) di atas Radix.
- `src/components/app-shell.tsx` — layout global.
- `src/components/theme-provider.tsx` + `theme-toggle.tsx` — next-themes.
- `src/components/file-dropzone.tsx` — wrapper react-dropzone.
- `src/app/kitchen-sink/page.tsx` — halaman preview semua komponen.

---

## Menjalankan Lokal

Butuh Postgres running (default `.env.example` pakai `postgresql://postgres:dev@localhost:5435/gencontent`). Cara paling cepat:

```bash
docker run -d --name gencontent-pg \
  -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=gencontent \
  -p 5435:5432 postgres:16
```

Setelah Postgres siap:

```bash
pnpm install
cp .env.example .env.local     # sesuaikan
pnpm db:push                   # sync Prisma schema → Postgres (dev-friendly, tidak generate file migration)
pnpm db:seed                   # buat admin default (email/password lihat prisma/seed.ts)
pnpm fonts:fetch               # download 16 curated Google Fonts → public/fonts/
pnpm dev                       # Next.js di :3000
pnpm worker                    # (di terminal terpisah, kalau JOB_QUEUE=bullmq)
```

> Untuk perubahan schema di prod, pakai `pnpm db:migrate` (menghasilkan file migration di `prisma/migrations/`). `db:push` hanya untuk dev — data-loss disclaimer di-print oleh Prisma sesuai kebutuhan.

> Font TTF di-commit ke repo, jadi `pnpm fonts:fetch` cukup dijalankan sekali saat fresh clone (atau setiap kali kamu menambah entry baru di `src/lib/font-catalog.ts` + `scripts/fetch-fonts.ts`).

Env penting (`.env.example`):
- `DATABASE_URL` — Prisma
- `STORAGE_DRIVER` — `local` | `r2`
- `JOB_QUEUE` — `memory` | `bullmq` (butuh `REDIS_URL`)
- `LLM_PROVIDER` — `gemini` | `anthropic-gateway` | `anthropic-direct` + API key masing-masing
- `SESSION_PASSWORD` — 32+ karakter random untuk enkripsi cookie iron-session. Generate: `openssl rand -base64 48`. **Wajib** — server tidak start tanpa ini.
- `SESSION_COOKIE_NAME` — default `genc_session`

## Bootstrap Admin Pertama

`pnpm db:seed` menjalankan `prisma/seed.ts` yang meng-upsert satu user ADMIN aktif. Kredensial default ada di file itu — **ganti sebelum production**:

```
email    : adminui@gmail.com
password : MEDIAUIADMIN@123
```

Login di `/login` dengan kredensial tsb. User berikutnya bisa register via `/register` (default status `PENDING`) — admin approve di `/admin/users`.

Kalau kamu ingin admin email/password lain tanpa mengubah seed script, edit langsung baris konstanta di `prisma/seed.ts` atau insert manual via psql:

```bash
node -e "console.log(require('bcryptjs').hashSync('PASSWORD_ANDA', 10))"
# copy hash ke query berikut
psql $DATABASE_URL -c "INSERT INTO \"User\" (id, email, \"passwordHash\", name, role, status, \"createdAt\", \"updatedAt\") VALUES ('admin_seed_1', 'admin@example.com', '<PASTE_HASH>', 'Admin', 'ADMIN', 'ACTIVE', NOW(), NOW());"
```

## Scripts

| Command | Fungsi |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Build & serve produksi |
| `pnpm worker` | Jalankan worker BullMQ (long-lived) |
| `pnpm submit-job` | Submit job dari CLI (debug) |
| `pnpm render` | Render satu video ad-hoc (debug FFmpeg pipeline) |
| `pnpm db:push` / `db:migrate` / `db:studio` / `db:seed` | Prisma workflow (push = dev sync, migrate = versioned prod, studio = GUI, seed = admin default) |
| `pnpm fonts:fetch` | Download curated Google Fonts ke `public/fonts/` (idempoten, `--force` untuk overwrite) |
| `pnpm cleanup-thumbnails` | Hapus file preview/uploaded thumbnail lokal yang mtime > 7 hari (jalankan via cron di prod-lite) |
| `pnpm test` | Vitest |
