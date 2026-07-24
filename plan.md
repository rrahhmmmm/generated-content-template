# Multi-Account Video Content Generator — Build Plan

Dokumen ini adalah spesifikasi untuk Claude Code. Dibaca dari atas ke bawah, tiap fase menghasilkan sesuatu yang bisa dijalankan.

---

## 1. Ringkasan sistem

Satu klip video masuk, sepuluh video keluar — masing-masing sudah memakai overlay template milik akun sosial media yang bersangkutan, dengan caption dan teks thumbnail yang sudah ditulis ulang agar tidak identik antar akun.

```
Admin  ──upload frame PNG + intro PNG──►  Account (10x)
User   ──upload clip + caption + thumbnail text──►  Job
Job    ──fan-out──►  10 Renditions
                       ├─ LLM: rewrite caption & thumbnail text
                       └─ FFmpeg: video + frame + intro card + drawtext
User   ──download video + copy caption──►  selesai
```

### Komposisi layer

Ini bentuk visual yang harus dihasilkan, dari bawah ke atas:

```
┌─────────────────────────────┐
│  Video (full-bleed 1080x1920)│  0 → akhir
│  ┌───────────────────────┐   │
│  │  Frame + logo + garis  │   │  0 → akhir
│  │  ┌─────────────────┐   │   │
│  │  │  Kartu putih    │   │   │  0 → 5 detik
│  │  │  + teks thumbnail│  │   │  0 → 5 detik
│  │  └─────────────────┘   │   │
│  └───────────────────────┘   │
└─────────────────────────────┘
```

Video mengisi seluruh kanvas — tidak diletakkan di dalam kotak. Overlay menimpa video, termasuk area putih solid pada PNG.

### Boundary yang tidak boleh kabur

**LLM tidak pernah menyentuh video.** LLM hanya menerima teks dan mengembalikan teks. Teks hasilnya lalu masuk ke FFmpeg sebagai parameter. Kalau ada kode yang mengirim frame video ke LLM, itu bug arsitektur, bukan fitur.

**Template adalah data, bukan kode.** Satu template = dua PNG + satu JSON layout. Menambah akun ke-11 tidak boleh butuh deploy.

**Dua layer punya umur berbeda.** Frame hidup seluruh durasi; kartu intro dan teksnya mati di detik 5. Jangan pernah menggabungkan keduanya jadi satu PNG — teks thumbnail akan menempel sampai video habis.

**Rendition adalah unit kerja, bukan job.** Satu job punya 10 rendition. Kalau rendition ke-7 gagal, sembilan lainnya tetap selesai dan bisa didownload. Jangan pernah membuat job gagal total karena satu rendition error.

---

## 2. Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Frontend | Next.js App Router + TypeScript | Sudah familiar dari `pos-sedurasa` |
| Styling | Tailwind + shadcn/ui | Token-based, cocok untuk design system |
| Backend | Next.js Route Handlers | Cukup untuk CRUD; tidak perlu Express terpisah |
| Worker | Node.js standalone + BullMQ | Render harus lepas dari request lifecycle |
| Queue | Redis (Upstash / self-host) | BullMQ butuh Redis |
| Database | PostgreSQL + Prisma | Relasi job→rendition jelas |
| Storage | Cloudflare R2 (S3-compatible) | Egress gratis; video besar |
| Render | FFmpeg (binary di worker) | Overlay statis = use case inti FFmpeg |
| LLM | Anthropic API (`claude-sonnet-4-6`) | Rewrite caption, structured JSON output |

### Kenapa worker terpisah dari Next.js

Render 10 video butuh 40–90 detik. Serverless function timeout jauh sebelum itu, dan FFmpeg butuh binary di filesystem. Worker jalan sebagai proses long-lived (Railway/Fly.io/VPS), ambil job dari Redis, tulis hasil ke R2, update Postgres. Next.js hanya menulis job ke queue lalu mengembalikan `jobId`.

---

## 3. Data model

```prisma
model Account {
  id            String   @id @default(cuid())
  handle        String   @unique          // "@brand.jakarta"
  platform      Platform                   // TIKTOK | INSTAGRAM | YOUTUBE
  displayName   String
  isActive      Boolean  @default(true)
  template      Template?
  renditions    Rendition[]
  createdAt     DateTime @default(now())
}

model Template {
  id            String   @id @default(cuid())
  accountId     String   @unique
  account       Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  frameKey      String                     // R2 key — PNG frame, seluruh durasi
  introKey      String?                    // R2 key — PNG kartu intro, 0–5 detik
  width         Int      @default(1080)
  height        Int      @default(1920)
  layout        Json                       // TemplateLayout, lihat §4
  version       Int      @default(1)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Job {
  id            String    @id @default(cuid())
  sourceKey     String                     // R2 key klip asli
  sourceDuration Float?
  baseCaption   String    @db.Text
  baseThumbText String
  status        JobStatus @default(QUEUED)
  renditions    Rendition[]
  createdAt     DateTime  @default(now())
  completedAt   DateTime?
}

model Rendition {
  id            String          @id @default(cuid())
  jobId         String
  job           Job             @relation(fields: [jobId], references: [id], onDelete: Cascade)
  accountId     String
  account       Account         @relation(fields: [accountId], references: [id])
  status        RenditionStatus @default(PENDING)
  caption       String?         @db.Text   // hasil rewrite LLM
  thumbText     String?                    // hasil rewrite LLM
  outputKey     String?                    // R2 key video jadi
  thumbnailKey  String?                    // R2 key preview JPG
  errorMessage  String?         @db.Text
  attempts      Int             @default(0)
  startedAt     DateTime?
  finishedAt    DateTime?

  @@unique([jobId, accountId])
  @@index([jobId, status])
}

enum Platform         { TIKTOK INSTAGRAM YOUTUBE }
enum JobStatus        { QUEUED PROCESSING PARTIAL COMPLETED FAILED }
enum RenditionStatus  { PENDING WRITING RENDERING DONE FAILED }
```

`@@unique([jobId, accountId])` penting: kalau worker retry, tidak akan tercipta rendition duplikat.

`JobStatus.PARTIAL` dipakai kalau sebagian rendition selesai dan sebagian gagal — user tetap bisa download yang berhasil.

---

## 4. Template layout schema

Simpan sebagai JSON di `Template.layout`. Semua koordinat dalam pixel absolut pada kanvas 1080×1920.

```typescript
type TemplateLayout = {
  canvas: { width: number; height: number };   // 1080 x 1920

  // Video adalah base layer full-bleed. Tidak ada videoRect —
  // video mengisi seluruh kanvas, overlay menimpa di atasnya.
  videoFit: 'cover';

  // Layer permanen: frame, logo, garis, handle akun
  frame: {
    overlayKey: string;
  };

  // Layer sementara: kartu putih + teks thumbnail
  intro: IntroCard | null;    // null = akun ini tanpa kartu intro
};

type IntroCard = {
  overlayKey: string;
  startSec: number;           // 0
  endSec: number;             // 5
  fadeOutSec: number;         // 0.3 — kartu dan teks memudar bersamaan

  text: {
    // Kotak tempat teks hidup, bukan titik tunggal.
    // Teks di-anchor ke top-left kotak agar 2 baris dan 5 baris sama rapi.
    box: { x: number; y: number; w: number; h: number };
    padding: { top: number; right: number; bottom: number; left: number };

    fontFile: string;         // nama file di /fonts
    fontSize: number;         // ukuran ideal
    minFontSize: number;      // batas bawah auto-shrink
    lineHeight: number;       // pengali, mis. 1.22
    color: string;
    align: 'left' | 'center' | 'right';
    uppercase: boolean;
    maxLines: number;
    shadow?: { color: string; x: number; y: number };
  };
};
```

### Keputusan yang perlu dipahami

**Tidak ada `videoRect`.** Area putih pada PNG bukan lubang tempat video — itu elemen desain yang menimpa video. Video selalu `scale` + `crop` ke 1080×1920 penuh.

**`text` berada di dalam `intro`, bukan array terpisah.** Teks thumbnail secara logis milik kartu intro: muncul dan hilang bersamanya. Memisahkannya membuat timing bisa desync.

**`box` menggantikan `x`/`y`/`maxWidth`.** Teks rata kiri mulai dari atas kotak. Dengan box, jumlah baris berapa pun tetap terkurung rapi di dalam kartu.

**Caption tidak ada di sini.** Caption tidak pernah di-burn ke video — ia hanya teks yang disalin user saat upload manual ke platform.

### Contoh nyata (akun @kicauonline)

```json
{
  "canvas": { "width": 1080, "height": 1920 },
  "videoFit": "cover",
  "frame": { "overlayKey": "templates/kicauonline/frame-v1.png" },
  "intro": {
    "overlayKey": "templates/kicauonline/intro-v1.png",
    "startSec": 0,
    "endSec": 5,
    "fadeOutSec": 0.3,
    "text": {
      "box": { "x": 60, "y": 975, "w": 950, "h": 310 },
      "padding": { "top": 40, "right": 40, "bottom": 40, "left": 40 },
      "fontFile": "Inter-Black.ttf",
      "fontSize": 58,
      "minFontSize": 40,
      "lineHeight": 1.22,
      "color": "#111111",
      "align": "left",
      "uppercase": true,
      "maxLines": 5
    }
  }
}
```

Angka `box` di atas adalah perkiraan awal dari PNG contoh. Verifikasi lewat preview canvas di fase 1 sebelum dipakai produksi.

### Cara admin membuat template

Fase 1: upload dua PNG, isi form koordinat manual, klik "Pratinjau" untuk melihat komposisi dengan teks dummy panjang dan pendek. Cukup untuk 10 akun.

Visual editor (drag box di atas pratinjau) masuk fase 5 — jangan bangun sekarang.

---

## 5. Render pipeline

### Kontrak worker

```typescript
type RenderInput = {
  renditionId: string;
  sourceKey: string;
  layout: TemplateLayout;
  frameKey: string;
  introKey: string | null;
  thumbText: string;          // sudah hasil LLM, sudah tervalidasi
};
```

### Langkah

1. Download `sourceKey`, `frameKey`, `introKey` dari R2 ke `/tmp/{renditionId}/`
2. Probe durasi sumber dengan `ffprobe`
3. Hitung layout teks (§5b) → menghasilkan `fontSize` final dan array baris
4. Tulis tiap baris ke file `.txt` terpisah di `/tmp/{renditionId}/`
5. Bangun `filter_complex`
6. Jalankan FFmpeg → H.264 + AAC, `-movflags +faststart`
7. Ekstrak thumbnail JPG dari detik 2 (di dalam window intro, agar preview menampilkan kartu)
8. Upload video + thumbnail ke R2
9. Update rendition → `DONE`
10. Hapus `/tmp/{renditionId}/` di blok `finally`

### filter_complex

```
[0:v]scale=1080:1920:force_original_aspect_ratio=increase,
     crop=1080:1920,setsar=1[vid];

[vid][1:v]overlay=0:0[framed];

[2:v]format=rgba,fade=t=out:st=4.7:d=0.3:alpha=1[card];
[framed][card]overlay=0:0:enable='lt(t,5)'[carded];

[carded]drawtext=fontfile=/fonts/Inter-Black.ttf:
        textfile=/tmp/{id}/l1.txt:x=100:y=1015:
        fontsize=58:fontcolor=#111111:enable='lt(t,5)',
        drawtext=fontfile=/fonts/Inter-Black.ttf:
        textfile=/tmp/{id}/l2.txt:x=100:y=1086:
        fontsize=58:fontcolor=#111111:enable='lt(t,5)'[out]
```

Input: `0` = video sumber, `1` = frame PNG, `2` = intro PNG.

**Urutan layer tidak boleh ditukar.** Video → frame → kartu intro → teks. Kalau frame ditumpuk setelah kartu, logo akan tertutup.

**`enable='lt(t,5)'` wajib ada di setiap `drawtext`, bukan hanya di overlay kartu.** Ini kesalahan yang paling mudah terjadi dan paling sulit terlihat saat review kode: kartunya hilang di detik 5, tapi teksnya menempel di atas video sampai habis.

**`st` pada fade dihitung sebagai `endSec - fadeOutSec`.** Jangan hardcode 4.7 — turunkan dari layout.

**Kalau `intro` null**, lewati input `2`, seluruh blok `card`, dan semua `drawtext`. Rantai berhenti di `[framed]`.

### Escaping

Teks user masuk ke argumen FFmpeg. Karakter `:`, `'`, `\`, `%` merusak filter graph. **Jangan pernah interpolasi string mentah ke `text=`.**

Selalu tulis ke file dan pakai `textfile=`. Ini menghilangkan seluruh kelas bug escaping, dan sekaligus membuat multi-baris jadi wajar.

### Concurrency

FFmpeg `-preset veryfast` di 8 vCPU: 3 render paralel per worker. Lebih dari itu tiap render melambat tanpa gain. Set `concurrency: 3` di BullMQ.

---

## 5b. Text fitting

Ini kerjaan nyata, bukan detail kecil. FFmpeg tidak melakukan text wrapping sama sekali — semua harus dihitung di JS sebelum filter dibangun.

### Algoritma

```typescript
function fitText(raw: string, cfg: IntroCard['text']) {
  const text = cfg.uppercase ? raw.toUpperCase() : raw;
  const innerW = cfg.box.w - cfg.padding.left - cfg.padding.right;
  const innerH = cfg.box.h - cfg.padding.top - cfg.padding.bottom;

  for (let size = cfg.fontSize; size >= cfg.minFontSize; size -= 2) {
    const lines = wrapByWord(text, size, innerW);      // ukur via opentype.js
    const needed = lines.length * size * cfg.lineHeight;
    if (lines.length <= cfg.maxLines && needed <= innerH) {
      return { fontSize: size, lines };
    }
  }

  // Semua ukuran gagal — potong di batas kata pada ukuran terkecil
  const lines = wrapByWord(text, cfg.minFontSize, innerW).slice(0, cfg.maxLines);
  return { fontSize: cfg.minFontSize, lines, truncated: true };
}
```

### Pengukuran lebar

Gunakan `opentype.js` membaca file `.ttf` **yang sama persis** dengan yang dipakai FFmpeg. Perkiraan char-width akan meleset jauh pada font kondensasi seperti Inter Black — teks akan meluber keluar kartu tanpa terdeteksi.

```typescript
const font = await opentype.load('/fonts/Inter-Black.ttf');
const width = font.getAdvanceWidth(line, fontSize);
```

Cache objek font di level modul; jangan load ulang tiap rendition.

### Posisi baris

```
y_baris_n = box.y + padding.top + (n * fontSize * lineHeight)
```

Untuk `align: 'left'`, `x = box.x + padding.left` (konstan).
Untuk `center`, hitung per baris: `x = box.x + (box.w - lineWidth) / 2`.

### Kalau teks terpotong

Set `rendition.errorMessage` sebagai peringatan (bukan status `FAILED`) dan tampilkan badge di UI. Video tetap jadi dan bisa dipakai — user yang memutuskan apakah perlu memperpendek teks sumbernya.

---

## 6. LLM rewrite

Satu panggilan per job, bukan per rendition — hemat 10x biaya dan menjamin variasi antar akun (model melihat semua sekaligus, jadi bisa membuat masing-masing berbeda).

### Prompt

```
System:
Kamu menulis ulang caption dan teks thumbnail untuk beberapa akun sosial media
yang memposting konten sama. Inti pesan, fakta, angka, nama produk, dan call-to-action
harus identik dengan versi asli. Yang berubah hanya susunan kalimat, pilihan kata,
dan pembuka — supaya platform tidak mendeteksi konten duplikat.

Aturan:
- Jangan menambah klaim, angka, atau janji yang tidak ada di teks asli
- Jangan menghapus informasi dari teks asli
- Teks thumbnail maksimal {maxChars} karakter, tanpa emoji
- Caption boleh pakai emoji dan hashtag kalau versi asli punya
- Sesuaikan gaya dengan platform tiap akun

Balas HANYA JSON, tanpa markdown fence:
{"results":[{"accountId":"...","caption":"...","thumbText":"..."}]}

User:
Caption asli: {baseCaption}
Thumbnail asli: {baseThumbText}

Akun:
- {accountId} | {handle} | {platform} | thumbnail max {maxChars} karakter
...
```

### Validasi wajib

LLM output tidak boleh dipercaya mentah. Sebelum masuk render:

- Parse JSON; kalau gagal, retry sekali dengan pesan error, lalu fallback ke teks asli
- Cek tiap `accountId` ada dan tidak ada yang hilang
- Cek `thumbText.length <= maxChars`; kalau lebih, truncate di batas kata
- Cek `thumbText` tidak kosong

Kalau validasi gagal untuk satu akun, pakai teks asli untuk akun itu dan lanjutkan. Job tidak boleh gagal gara-gara LLM.

---

## 7. Design system

Ini fondasi yang harus benar sejak awal, karena mengganti token setelah 40 komponen jadi jauh lebih mahal.

### Token

Definisikan di `globals.css` sebagai CSS variable, expose ke Tailwind lewat `tailwind.config.ts`. Jangan pernah menulis hex langsung di komponen.

```css
:root {
  --bg:            #FBFBFA;
  --surface:       #FFFFFF;
  --surface-sunk:  #F4F4F2;
  --border:        #E4E4E1;
  --border-strong: #C9C9C4;

  --text:          #1C1C1A;
  --text-muted:    #6B6B66;
  --text-subtle:   #93938D;

  --accent:        #2F5FE0;
  --accent-hover:  #2650C4;
  --accent-bg:     #EDF2FE;

  --success:       #1D7A55;  --success-bg: #E6F4EE;
  --warning:       #A66B00;  --warning-bg: #FDF3E0;
  --danger:        #C0392B;  --danger-bg:  #FBEDEB;

  --radius-sm: 6px;  --radius: 10px;  --radius-lg: 14px;
}
```

Dark mode: definisikan ulang variable yang sama di `.dark`. Komponen tidak perlu diubah sama sekali.

### Type scale

Satu font family untuk semua (Inter atau Geist). Ini tool internal, bukan landing page — konsistensi lebih berharga daripada karakter.

| Token | Size / line-height | Weight | Dipakai untuk |
|---|---|---|---|
| `text-display` | 28 / 34 | 500 | Judul halaman |
| `text-title` | 20 / 28 | 500 | Judul section, judul card |
| `text-body` | 15 / 24 | 400 | Isi utama |
| `text-label` | 13 / 18 | 500 | Label form, header tabel |
| `text-caption` | 12 / 16 | 400 | Metadata, timestamp, hint |

Dua weight saja: 400 dan 500. Menambah 600/700 membuat UI terasa berat dan tidak konsisten.

### Spacing

Kelipatan 4. Gunakan hanya: `4 8 12 16 24 32 48 64`. Jarak lain tidak boleh muncul.

### Komponen dasar

Bangun ini dulu sebelum menyentuh halaman apapun:

`Button` (primary/secondary/ghost/danger × sm/md) · `Input` · `Textarea` · `Select` · `Card` · `Badge` (status) · `Dialog` · `Toast` · `Progress` · `Skeleton` · `EmptyState` · `FileDropzone`

Ambil dari shadcn/ui, lalu **ganti semua warna hardcoded dengan token di atas**. shadcn default memakai palet sendiri; kalau tidak diganti, design system-nya hanya di atas kertas.

### Status badge — kunci mapping sekali

| Status | Warna | Label |
|---|---|---|
| `PENDING` | muted | Menunggu |
| `WRITING` | accent | Menulis caption |
| `RENDERING` | accent | Merender |
| `DONE` | success | Selesai |
| `FAILED` | danger | Gagal |

Satu komponen `<StatusBadge status={...} />`. Jangan pernah menulis warna status manual di halaman.

---

## 8. Halaman

### `/accounts` — kelola akun

Tabel: handle, platform, status template (ada/belum), tanggal update, aksi. Tombol "Tambah akun" membuka dialog.

### `/accounts/[id]/template` — atur template

Kiri: dua dropzone terpisah berlabel jelas — "Frame (seluruh durasi)" dan "Kartu intro (5 detik pertama)". Di bawahnya form untuk `intro.text`: box, padding, font, ukuran, perataan.

Kanan: pratinjau canvas dengan toggle waktu — tombol "Detik 2" dan "Detik 10". Detik 2 menampilkan video + frame + kartu + teks; detik 10 hanya video + frame. Toggle ini yang membuat admin melihat perbedaan umur layer secara langsung.

Sediakan tombol uji teks pendek dan teks panjang agar admin bisa melihat auto-shrink bekerja sebelum menyimpan.

Bangun dengan `<canvas>`, bukan CSS absolute positioning — CSS akan menyimpang dari hasil FFmpeg. Gunakan `opentype.js` yang sama dengan worker untuk mengukur teks, agar pratinjau dan hasil render identik.

### `/create` — buat konten

Satu kolom, tiga langkah vertikal:
1. Dropzone video (MP4/MOV, maks 200 MB) dengan preview player
2. Textarea caption + input teks thumbnail, dengan counter karakter
3. Daftar akun dengan checkbox — semua tercentang secara default; akun tanpa template ditampilkan disabled dengan alasan

Tombol "Buat 10 video" → POST `/api/jobs` → redirect ke `/jobs/[id]`.

### `/jobs/[id]` — hasil

Grid kartu, satu per akun. Tiap kartu: thumbnail preview, handle akun, status badge, caption dalam box dengan tombol salin, tombol unduh.

Header: progress keseluruhan ("7 dari 10 selesai"), tombol "Unduh semua (.zip)" yang aktif setelah minimal satu rendition `DONE`.

Polling `/api/jobs/[id]` tiap 3 detik selama status bukan terminal. Jangan pakai WebSocket — polling cukup dan jauh lebih sedikit kode.

Kartu yang gagal menampilkan pesan error dan tombol "Coba lagi" yang me-requeue rendition itu saja.

### `/jobs` — riwayat

Tabel job: thumbnail, caption terpotong, jumlah selesai/total, waktu, link ke detail.

---

## 9. API

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/accounts` | Daftar akun + status template |
| `POST` | `/api/accounts` | Buat akun |
| `PATCH` | `/api/accounts/[id]` | Ubah / nonaktifkan |
| `PUT` | `/api/accounts/[id]/template` | Simpan overlay + layout |
| `POST` | `/api/uploads/presign` | URL presigned R2 untuk upload langsung |
| `POST` | `/api/jobs` | Buat job + rendition + enqueue |
| `GET` | `/api/jobs/[id]` | Status job + semua rendition |
| `GET` | `/api/jobs/[id]/download` | Stream ZIP semua rendition `DONE` |
| `POST` | `/api/renditions/[id]/retry` | Requeue satu rendition |

**Upload lewat presigned URL, bukan lewat server.** File 200 MB tidak boleh melewati Next.js — client upload langsung ke R2, lalu kirim key-nya ke `/api/jobs`.

---

## 10. Fase pengerjaan

Tiap fase harus bisa dijalankan dan diverifikasi sebelum lanjut.

**Fase 0 — Fondasi**
Setup Next.js, Prisma, schema, migrate. Token CSS + Tailwind config. Komponen dasar di §7. Halaman `/kitchen-sink` yang menampilkan semua komponen dalam semua state, light dan dark.
*Selesai kalau:* kitchen sink terlihat konsisten di kedua mode.

**Fase 1 — Akun & template**
CRUD akun. Upload frame + intro PNG ke R2. Form layout. Canvas pratinjau dengan toggle detik 2 / detik 10.
*Selesai kalau:* 10 akun tersimpan, pratinjau menampilkan kartu intro hanya pada detik 2, dan auto-shrink terlihat bekerja pada teks panjang.

**Fase 2 — Render engine (tanpa UI)**
Modul `fitText` dengan unit test lebih dulu — kasus 1 baris, 5 baris, dan teks yang harus dipotong. Lalu script CLI:

```
pnpm render --source clip.mp4 --layout layouts/kicauonline.json \
            --text "SEBELUMNYA APRESASI POLRI PENANGKAPAN JAMPIDSUS" \
            --out out.mp4
```

Buktikan FFmpeg benar sebelum menyentuh queue, database, atau LLM.
*Selesai kalau:* MP4 keluar dengan kartu + teks hilang tepat di detik 5, frame dan logo bertahan sampai akhir, dan teks terkurung rapi di dalam kartu.

**Fase 3 — Queue & worker**
BullMQ, Redis, worker proses. LLM rewrite + validasi. Endpoint `/api/jobs`.
*Selesai kalau:* POST job menghasilkan 10 file di R2 dan 10 baris rendition `DONE`.

**Fase 4 — UI penuh**
Halaman `/create`, `/jobs/[id]`, `/jobs`. Polling, salin caption, unduh, ZIP, retry.
*Selesai kalau:* alur penuh berjalan dari browser tanpa sentuh terminal.

**Fase 5 — Pengerasan**
Rate limit per user. Dead-letter queue untuk rendition yang gagal 3x. Cleanup file sumber setelah 7 hari. Log terstruktur. Health check worker.

---

## 11. Hal yang mudah salah

**`enable` lupa dipasang di `drawtext`.** Jebakan nomor satu di sistem ini. Kartu intro hilang di detik 5 tapi teksnya bertahan sampai video habis. Tidak terlihat saat memeriksa frame pertama — hanya muncul kalau video diputar sampai lewat detik 5. Masukkan ini ke checklist review dan ke test fase 2.

**FFmpeg tidak melakukan text wrapping.** Harus dihitung di JS sebelum membangun filter. Ini kerjaan nyata, bukan detail kecil.

**Pengukuran teks harus pakai file font yang sama.** Kalau pratinjau memakai font web dan worker memakai `.ttf` berbeda, teks akan pas di layar admin tapi meluber di hasil render.

**Font harus di-bundle.** Docker image worker perlu file `.ttf` di `/fonts`. Font sistem tidak bisa diandalkan ada.

**`/tmp` bisa penuh.** Sepuluh video 200 MB = 2 GB per job, plus output. Hapus di `finally`, dan monitor disk.

**Prisma connection pool di worker.** Worker long-lived dengan concurrency 3 — set `connection_limit` eksplisit di connection string, jangan pakai default.

**Retry harus idempotent.** BullMQ akan mengulang job saat worker crash. Cek `rendition.status === 'DONE'` di awal handler dan langsung return kalau sudah selesai.

**Video vertikal vs horizontal.** Klip user mungkin 16:9 sementara template 9:16. `scale` + `crop` di §5 menanganinya, tapi hasilnya memotong sisi. Tampilkan peringatan di `/create` kalau rasio sumber berbeda jauh dari template.

**Biaya LLM naik kalau per-rendition.** Satu panggilan per job, bukan sepuluh. Sudah dirancang begitu di §6 — jangan diubah saat refactor.

---

## 12. Auto-Generate Thumbnail per Account (Fase 5 — pasca-build)

### Motivasi

Sepuluh rendition dari satu video sumber menghasilkan thumbnail yang isi framenya identik — cuma overlay yang beda (default: frame detik 2 dari output video, `process-rendition.ts:88`). Platform gampang menandai sebagai konten duplikat. Fase ini mengangkat unikitas thumbnail antar akun jadi urusan kelas satu: ekstrak N frame **berbeda** dari video sumber, lengkap dengan dedup perseptual supaya video statis (talking head, slide) tetap menghasilkan thumbnail unik.

### Flow

```
User upload video → probeDuration disimpan di Job.sourceDuration
User pilih akun + isi caption/thumbText
User (opsional) klik "Generate Thumbnails":
  POST /api/thumbnails/generate → { taskId } (langsung, non-blocking)
    → create ThumbnailTask row (Prisma, status QUEUED)
    → enqueue via queue existing (memory/bullmq) sebagai "thumbnail-generation"

Worker ambil task:
  1. Materialize source
  2. BATCH probeBrightnessMap  ← 1 spawn FFmpeg (signalstats + metadata=print)
  3. computeAdaptiveMinY dari p25 sampling (floor 20, 0.7 * p25)
  4. distributeTimestamps(duration, N, min=0.3s)
  5. Parallel extractFrameWithHash → filter_complex dual output (JPG + 9×8 gray)
     dHash 64-bit dihitung tanpa dep image processing
  6. dedupAndAdjust: Hamming pairwise; kalau <10, walk ke kandidat brightMap layak, max 5×
     Tersisa → flag similar:true (bukan fail)
  7. Upload key: thumbnails/preview/{taskId}/{accountId}_{w}x{h}.jpg
  8. Update ThumbnailTask.items + status DONE

UI poll GET /api/thumbnails/generate/[taskId] tiap 1s:
  Grid card per akun, badge platform + timestamp, warning adjusted/similar
  Tombol "Replace" → FileDropzone → POST /api/thumbnails/upload → override

Submit (SELALU boleh, non-blocking):
  POST /api/jobs body extend thumbnails[]? (partial OK)
    Untuk tiap entry: copy preview/uploaded → renditions/pre/{jobId}/{renditionId}/thumb.jpg
    Set Rendition.thumbnailKey + thumbnailSource + thumbnailTimestampSec

Worker rendition:
  if (rendition.thumbnailKey) → skip extract (pre-job sudah)
  else → fallback: extract detik 2 dari output (behavior lama)
```

### Data model tambahan

```prisma
model Rendition {
  // ...existing...
  thumbnailSource       String?  // "AUTO" | "MANUAL"
  thumbnailTimestampSec Float?
}

model ThumbnailTask {
  id        String   @id @default(cuid())
  sourceKey String
  status    String   @default("QUEUED")   // QUEUED | RUNNING | DONE | FAILED
  progress  String   @default("{}")        // JSON { done, total }
  items     String   @default("[]")        // JSON GeneratedThumb[]
  warnings  String   @default("[]")        // JSON string[]
  error     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

`Job.sourceDuration` sudah ada — mulai diisi di `/api/uploads/video`.

### Boundary yang tidak boleh kabur

**Submit tidak pernah di-block oleh thumbnail.** Kalau task fail, user skip, atau sebagian akun tidak ter-generate — submit tetap jalan. Worker fallback ke behavior lama (extract detik 2 dari output). Ini kontrak: "auto-thumbnail" is best-effort, bukan pre-requisite.

**Dedup perseptual, bukan cuma brightness.** Filter brightness saja tidak cukup untuk video statis. `dedup.ts` dengan dHash 64-bit + Hamming distance adalah alasan utama fitur ini ada; jangan disederhanakan jadi "extract merata sepanjang durasi".

**Thumbnail preview terpisah dari final.** Pre-job path `thumbnails/preview/{taskId}/...` bersifat sementara (R2 lifecycle 7 hari). Saat submit, file **di-copy** ke `renditions/pre/{jobId}/{renditionId}/thumb.jpg` — path final. Jangan simpan `preview/...` langsung sebagai Rendition.thumbnailKey; lifecycle akan menghapusnya.

**Batch probe = 1 spawn.** Anti-pattern lama: per-timestamp brightness check (10 akun × ≤7 walk = up to 70 spawn per task). Sekarang: 1 spawn seluruh video via `fps=1/0.5,signalstats,metadata=print:file=-`. Kalau code review menemukan `spawn(FFMPEG_BIN, [..., "signalstats", ...])` di dalam loop, itu regresi.

**Task async via queue existing.** Jangan bikin infra baru (Redis task queue terpisah, cron scheduler). Reuse `src/lib/queue/` — 2 job type: `"rendition"` dan `"thumbnail-generation"`. State di Prisma `ThumbnailTask`. Multi-instance safe, dev-friendly (JOB_QUEUE=memory tetap jalan).

### Spawn budget per task (10 akun)

| Operasi | Spawn |
|---|---|
| Batch brightness probe | 1 |
| Extract frame + dHash (combined) | 10 |
| Dedup walk retry (bounded) | ≤ 5 |
| **Total** | **≤ 16** |

Regresi threshold: kalau kena >20 spawn per task, ada bug di dedup loop atau probe dipanggil di luar batch.

### Cleanup

- **R2 prod:** lifecycle rule 7 hari untuk `thumbnails/preview/` dan `thumbnails/uploaded/` (config di `docs/r2-lifecycle.json`).
- **Local dev:** `scripts/cleanup-thumbnails.ts` (via `pnpm cleanup-thumbnails`), hapus file mtime > 7 hari.

### Extension: Composite Thumbnail + Cover Frame Embed (Fase 6)

Instagram/Reels default pilih **frame 0** sebagai cover kalau user tidak set manual. Supaya thumbnail unik yang sudah kita generate benar-benar kepakai (bukan cuma di bundle download), worker post-render melakukan 2 step:

**Step A — Composite (`src/lib/render/composite-thumbnail.ts`):**
Raw thumbnail (frame video mentah, unik per akun) di-composite dengan frame overlay + intro card + drawtext — menghasilkan single-frame image dengan branding style yang IDENTIK dengan frame video di detik 0-5. Reuse `buildFilterComplex()` + `computeIntroFit()` dari pipeline render utama; bedanya: input 0 = image (bukan video), output = `-frames:v 1` JPG.

**Step B — Embed (`src/lib/render/embed-cover.ts`):**
Composite thumbnail di-prepend sebagai first frame video via FFmpeg:

```
[composite.jpg loop 150ms] + [rendered_video]  →  final.mp4
         ↑                          ↑
  scale2ref conform ke          h264+aac, +faststart
  dim video (auto)
```

Audio: `anullsrc` silence 150ms di-concat dengan audio video supaya sinkron.

**Boundary yang tidak boleh kabur (Fase 6):**

**Composite ≠ raw thumbnail.** Raw thumbnail = background frame per akun (unik). Composite = raw + template overlay (unik + branded). Kalau ada kode yang embed raw thumbnail langsung tanpa composite, frame 0 Reels akan kehilangan frame overlay + text — bug yang paling gampang di-regress karena "kayaknya cukup pakai thumbnail apa adanya".

**Composite jadi final `Rendition.thumbnailKey`.** DB thumbnailKey selalu point ke composite version (`renditions/{jobId}/{renditionId}/thumb.jpg`). Preview UI di `/create` show raw (state pre-submit, before worker); job detail + download bundle show composite (state post-render).

**Extract fallback dari SOURCE, bukan output.** Kalau user skip pre-job generate, worker extract fallback thumbnail dari `sourcePath` (video sumber), bukan `outputPath` (video ter-render). Alasan: composite akan apply overlay lagi — kalau background sudah punya overlay dari output, hasil = double overlay. Skip source-extract → skip regression.

Toggle:
- `EMBED_COVER_FRAME=false` — disable (default: enabled)
- `COVER_FRAME_DURATION_SEC=0.15` — tuning durasi flash

Cost: 1 composite spawn (~150ms) + 1 embed encode pass (~1-2 detik) per rendition. Semua rendition selalu composite + embed (baik pre-job maupun fallback thumbnail) supaya perilaku konsisten.

Trade-off: user akan lihat "flash" cover ~150ms di awal Reel. Diterima sebagai splash pattern yang umum di Reels.

### Out of Scope (V2)

Blur detection (Laplacian variance), regenerate satu thumbnail dari job-detail, editor manual crop/color, face detection, auto-upload via Instagram Graph API (zero-touch posting).
