#!/usr/bin/env tsx
// Long-running worker process untuk JOB_QUEUE=bullmq. Untuk JOB_QUEUE=memory,
// tidak butuh proses ini — handler jalan di dalam Next.js runtime lewat
// src/instrumentation.ts.
//
// Cara pakai:
//   JOB_QUEUE=bullmq REDIS_URL=redis://localhost:6379 pnpm worker

import "dotenv/config";
import { queue, ensureHandlersRegistered } from "../src/lib/queue";

async function main() {
  if ((process.env.JOB_QUEUE ?? "memory") !== "bullmq") {
    console.error(
      "Worker script hanya perlu untuk JOB_QUEUE=bullmq. Set env dulu, atau pakai `pnpm dev` untuk mode memory."
    );
    process.exit(1);
  }
  await ensureHandlersRegistered();
  const q = await queue();
  if (!q.startWorker) throw new Error("Queue ini tidak punya startWorker");
  await q.startWorker();
  console.log("[worker] siap. Ctrl+C untuk stop.");

  const shutdown = async () => {
    console.log("\n[worker] shutdown…");
    await q.shutdown?.();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
