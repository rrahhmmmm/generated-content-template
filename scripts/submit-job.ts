#!/usr/bin/env tsx
// Dev helper: upload video → POST /api/jobs → poll status → print hasil.
// Butuh Next.js sudah jalan (pnpm dev).
//
// Contoh:
//   pnpm submit-job \
//     --source video.mp4 \
//     --caption "Caption asli untuk semua akun" \
//     --thumb "TEKS THUMBNAIL PENDEK" \
//     --accounts @kicauonline,@akun2 \
//     --base http://localhost:3055

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";

type Args = Record<string, string>;
function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = "true";
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ["source", "caption", "thumb", "accounts"];
  for (const k of required) if (!args[k]) {
    console.error(`--${k} wajib. Contoh: --${k} ...`);
    process.exit(1);
  }
  const base = (args.base ?? "http://localhost:3055").replace(/\/+$/, "");
  const sourcePath = path.resolve(args.source);
  const accountList = args.accounts.split(",").map((s) => s.trim()).filter(Boolean);

  console.log("→ base   :", base);
  console.log("→ source :", sourcePath);
  console.log("→ akun   :", accountList.join(", "));
  console.log("");

  // 1. Resolve @handle atau id → account id
  const listRes = await fetch(`${base}/api/accounts`);
  if (!listRes.ok) throw new Error(`GET /api/accounts gagal: ${listRes.status}`);
  const accounts = (await listRes.json()) as Array<{ id: string; handle: string; template: unknown }>;
  const resolvedIds: string[] = [];
  for (const key of accountList) {
    const want = key.startsWith("@") ? key : `@${key}`;
    const found = accounts.find((a) => a.id === key || a.handle === want);
    if (!found) throw new Error(`Akun tidak ketemu: ${key}`);
    if (!found.template) throw new Error(`Akun ${found.handle} belum punya template`);
    resolvedIds.push(found.id);
  }
  console.log("→ resolved ids:", resolvedIds);

  // 2. Upload video
  const buffer = await fs.readFile(sourcePath);
  const filename = path.basename(sourcePath);
  const contentType = filename.endsWith(".mov") ? "video/quicktime" : "video/mp4";
  const fd = new FormData();
  fd.append("file", new Blob([buffer], { type: contentType }), filename);

  console.log("→ upload video…");
  const upRes = await fetch(`${base}/api/uploads/video`, { method: "POST", body: fd });
  if (!upRes.ok) {
    const body = await upRes.text();
    throw new Error(`Upload gagal ${upRes.status}: ${body}`);
  }
  const uploaded = (await upRes.json()) as { key: string; url: string; size: number };
  console.log(`  key=${uploaded.key} (${(uploaded.size / 1e6).toFixed(2)} MB)`);

  // 3. Create job
  console.log("→ create job…");
  const jobRes = await fetch(`${base}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourceKey: uploaded.key,
      baseCaption: args.caption,
      baseThumbText: args.thumb,
      accountIds: resolvedIds,
    }),
  });
  if (!jobRes.ok) {
    const body = await jobRes.text();
    throw new Error(`Create job gagal ${jobRes.status}: ${body}`);
  }
  const jobInit = (await jobRes.json()) as { id: string; status: string; renditionCount: number };
  console.log(`  jobId=${jobInit.id} (${jobInit.renditionCount} rendition)`);
  console.log("");

  // 4. Poll status setiap 2 detik
  const startedAt = Date.now();
  let lastLine = "";
  const timeoutMs = 5 * 60_000;
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(2000);
    const s = await fetch(`${base}/api/jobs/${jobInit.id}`);
    if (!s.ok) {
      console.error("Poll gagal:", s.status);
      continue;
    }
    const job = (await s.json()) as {
      status: string;
      summary: Record<string, number>;
      renditions: Array<{ status: string; account: { handle: string }; outputUrl: string | null; errorMessage: string | null }>;
    };
    const line = `status=${job.status} done=${job.summary.done}/${job.summary.total} rendering=${job.summary.rendering} writing=${job.summary.writing} failed=${job.summary.failed}`;
    if (line !== lastLine) {
      console.log(`[${((Date.now() - startedAt) / 1000).toFixed(1)}s]`, line);
      lastLine = line;
    }
    if (["COMPLETED", "PARTIAL", "FAILED"].includes(job.status)) {
      console.log("\n=== HASIL ===");
      for (const r of job.renditions) {
        const marker = r.status === "DONE" ? "✔" : r.status === "FAILED" ? "✗" : "…";
        console.log(`${marker} ${r.account.handle}  ${r.status}  ${r.outputUrl ?? r.errorMessage ?? ""}`);
      }
      return;
    }
  }
  console.error("Timeout menunggu job selesai.");
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
