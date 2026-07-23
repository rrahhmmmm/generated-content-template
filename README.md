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

### 10. UI Component Library
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
| `pnpm test` | Vitest |
