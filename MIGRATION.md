# Migration guide — dari dev lokal ke produksi

Tiga axis yang bisa di-swap independen. Semua diatur lewat env, kode tidak berubah.

| Axis    | Dev default    | Produksi target        | Env yang dipakai                                    |
|---------|----------------|------------------------|-----------------------------------------------------|
| LLM     | Gemini (free)  | Anthropic (gateway)    | `LLM_PROVIDER`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_GATEWAY_API_KEY` |
| Storage | Local (`./storage`) | Cloudflare R2      | `STORAGE_DRIVER`, `R2_*`                            |
| Queue   | In-process     | BullMQ + Redis         | `JOB_QUEUE`, `REDIS_URL`                            |

Anda boleh migrate salah satu tanpa yang lain. Tes tiap axis sebelum lanjut ke berikutnya — kalau ada bug, jelas di lapis mana.

---

## 1. LLM: NullProvider → Gemini free → Anthropic

### 1a. Aktifkan Gemini free (tetap gratis)

Sekarang: `LLM_PROVIDER=gemini` tapi `GOOGLE_GENERATIVE_AI_API_KEY=""` → factory auto fallback ke `NullLLMProvider` (semua akun pakai teks asli).

Aktifkan:
1. Ambil API key di https://aistudio.google.com/apikey (gratis, tanpa CC)
2. Isi `.env.local`: `GOOGLE_GENERATIVE_AI_API_KEY="AIza..."`
3. Restart `pnpm dev`
4. Submit job → log worker akan tulis `[job-prep] gemini/gemini-2.5-flash 850ms — fallback: 0/10` (fallback 0/10 = LLM sukses semua)

Sanity check yang mesti dilihat:
- Caption per rendition harus **berbeda antar akun** (bukan salinan mentah `baseCaption`)
- `thumbText` tetap ≤ `PLATFORM_THUMB_MAX[platform]`
- Kalau ada 1-2 akun yang `fellBack: true` di UI, itu normal (LLM output invalid untuk akun itu → pakai teks asli)

Rate limit gratis: 15 request per menit. Cukup untuk dev. Setiap job = 1 request (satu batch untuk semua akun), jadi bisa 15 job/menit.

### 1b. Pindah ke Anthropic (berbayar, kualitas lebih)

Dua sub-mode:

**Via Vercel AI Gateway (recommended)** — observability + fallback bawaan:
```
LLM_PROVIDER=anthropic-gateway
AI_GATEWAY_API_KEY=vg_...
LLM_MODEL=claude-sonnet-4-6         # opsional; default sudah ini
```

**Direct ke Anthropic** — tanpa gateway:
```
LLM_PROVIDER=anthropic-direct
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-6         # opsional
```

Kode tidak berubah. Hanya restart proses (Next.js dev + worker kalau BullMQ).

### 1c. Rollback

Kalau Anthropic bermasalah, ganti balik `LLM_PROVIDER=gemini`. Tidak ada state yang butuh di-flush — LLM stateless.

---

## 2. Storage: Local → Cloudflare R2

### 2a. Setup R2

1. Buat bucket di https://dash.cloudflare.com/?to=/:account/r2 (misal `gencontent-prod`)
2. R2 → Manage R2 API Tokens → **Create API token** → izin **Object Read & Write** → lingkup ke bucket tsb
3. Simpan `Access Key ID` + `Secret Access Key`
4. Untuk `R2_PUBLIC_URL`:
   - Pilihan cepat: R2 Settings → **Public access** → **Allow Access** → pakai URL `https://pub-<hash>.r2.dev`
   - Pilihan production: Custom domain (mis. `https://cdn.brand.com`)
5. `R2_ACCOUNT_ID` didapat dari URL dashboard atau R2 → **Account ID**

### 2b. Swap env

```
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=yyyyyyyyyy
R2_SECRET_ACCESS_KEY=zzzzzzzzzzzzzzzz
R2_BUCKET=gencontent-prod
R2_PUBLIC_URL=https://pub-xxxx.r2.dev    # atau custom domain
```

Restart. Karena `storage()` di factory sudah lazy-load `R2StorageAdapter`, cukup env swap.

### 2c. Migrate existing data (kalau perlu)

Local files ada di `./storage/`. Untuk copy ke R2:

```bash
# Install rclone atau pakai aws CLI dengan endpoint override
aws s3 sync ./storage/ s3://gencontent-prod/ \
  --endpoint-url https://<accountId>.r2.cloudflarestorage.com
```

Kunci-kunci di DB (`frameKey`, `introKey`, `outputKey`, `thumbnailKey`, `sourceKey`) tetap valid karena R2 dan Local pakai key scheme yang sama.

### 2d. Verifikasi

- `POST /api/uploads/video` → response `url` harus URL R2 (`https://pub-....r2.dev/...`), bukan `/api/uploads/local/...`
- Rendition output pertama → cek di dashboard R2 muncul file `renditions/<jobId>/<renditionId>/output.mp4`
- `curl <url>` → 200, dapat MP4

### 2e. Rollback

`STORAGE_DRIVER=local`. File di R2 tetap ada, tapi aplikasi baca dari lokal. Sinkronisasi manual kalau mau data konsisten.

---

## 3. Queue: In-process → BullMQ + Redis

### 3a. Kenapa perlu

In-process (`JOB_QUEUE=memory`) menjalankan render **dalam proses Next.js**. Beberapa masalah:
- Restart Next.js = job in-flight hilang
- Render 3 video paralel = event loop Next.js sibuk (request lain lambat)
- Scale horizontal = tidak bisa (tiap replica jalankan job-nya sendiri, tidak sinkron)

BullMQ + Redis memisahkan Next.js (produsen) dan worker (konsumen). Worker bisa di-scale, di-restart, dan job durable.

### 3b. Setup Redis

Pilihan lokal:
- `brew install redis && brew services start redis`
- `docker run -d -p 6379:6379 redis:7-alpine`

Produksi:
- Upstash (serverless, free tier generous)
- Fly.io Redis
- Railway Redis

### 3c. Swap env

```
JOB_QUEUE=bullmq
REDIS_URL=redis://localhost:6379          # atau URL Upstash rediss://...
WORKER_CONCURRENCY=3                       # plan.md §5: 3 render paralel per worker di 8 vCPU
```

### 3d. Jalankan worker terpisah

Next.js sekarang cuma push ke queue, tidak proses. Worker di terminal terpisah:

```
JOB_QUEUE=bullmq REDIS_URL=redis://localhost:6379 pnpm worker
```

Untuk produksi: deploy `pnpm worker` sebagai proses long-lived di Railway/Fly.io/VPS. Mesti punya:
- Akses `DATABASE_URL` yang sama
- Akses `REDIS_URL` yang sama
- Kredensial storage (`STORAGE_DRIVER` + `R2_*`)
- Kredensial LLM

### 3e. Verifikasi

Submit job, lihat 3 log berbeda:
1. **Next.js log**: `POST /api/jobs 201` — request selesai instant
2. **Worker log**: `[queue/bullmq] worker aktif, concurrency=3`, `[job-prep] gemini/... 850ms`, `[queue/bullmq] job xxx (job-prep) selesai`
3. **Redis**: `redis-cli KEYS 'bull:gencontent:*'` → ada entry `waiting`/`active`/`completed`

### 3f. Failure modes

- **Redis down** → Next.js POST /api/jobs error 500. Worker restart otomatis reconnect saat Redis up.
- **Worker crash mid-render** → BullMQ retry dengan exponential backoff (3 attempts default di `bullmq.ts`). Sisi rendition idempotent — cek `status === 'DONE'` di awal handler.
- **DB deadlock** — set `connection_limit` di `DATABASE_URL` untuk Postgres worker, mis. `?connection_limit=5` untuk 3 concurrency + spare.

### 3g. Rollback

`JOB_QUEUE=memory`. Stop worker. Restart Next.js. In-flight BullMQ job tetap di Redis — bisa di-flush manual (`redis-cli FLUSHDB` di DB Redis) atau biarkan expired.

---

## Checklist migrasi produksi lengkap

Urut dari yang paling murah rollback-nya:

- [ ] **LLM** ke Gemini free (belum bayar apapun)
- [ ] **LLM** ke Anthropic (mulai bayar $ per token)
- [ ] **Storage** ke R2 (bayar minimal karena egress gratis)
- [ ] **Queue** ke BullMQ + Upstash Redis (bayar Redis)
- [ ] Deploy `pnpm worker` sebagai proses terpisah
- [ ] Deploy Next.js ke Vercel/Railway
- [ ] Ganti `DATABASE_URL` ke Postgres (edit `prisma/schema.prisma`, ganti provider ke `postgresql`, restore `@db.Text` di kolom besar, ubah `layout String` → `layout Json`, re-migrate)
- [ ] Cabut `.env.local` dari dev, pindah semua secret ke Vercel env

Test tiap axis di dev sebelum ke produksi. Kalau tes lokal pakai R2, gunakan bucket `gencontent-dev` yang terpisah dari produksi.
