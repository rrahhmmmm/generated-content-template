// Job queue abstraction. Dua implementasi:
// - InProcessQueue (dev): fire-and-forget setImmediate + async handler. Sama proses
//   dengan Next.js. Kalau proses restart, job in-flight hilang.
// - BullMQQueue (prod): Redis-backed durable queue, worker process terpisah.
//
// Task types (§Fase 3):
// - "job-prep": panggil LLM batch untuk satu Job, isi caption/thumbText per
//   rendition, lalu enqueue 10 tasks "render-rendition".
// - "render-rendition": render satu rendition, upload output+thumbnail ke storage.
// - "thumbnail-generation" (§Fase 5): pre-job generate N thumbnail unik dari
//   video source, dedup perseptual, tulis hasil ke ThumbnailTask.items.

export type TaskType = "job-prep" | "render-rendition" | "thumbnail-generation";

export type TaskPayloads = {
  "job-prep": { jobId: string };
  "render-rendition": { renditionId: string };
  "thumbnail-generation": { taskId: string };
};

export type TaskHandler<T extends TaskType = TaskType> = (
  payload: TaskPayloads[T]
) => Promise<void>;

export interface JobQueue {
  readonly id: string;
  enqueue<T extends TaskType>(type: T, payload: TaskPayloads[T]): Promise<void>;
  registerHandler<T extends TaskType>(type: T, handler: TaskHandler<T>): void;
  /** Untuk BullMQ worker process. In-process auto-run pada enqueue. */
  startWorker?(): Promise<void>;
  shutdown?(): Promise<void>;
}

let cached: JobQueue | null = null;

export async function queue(): Promise<JobQueue> {
  if (cached) return cached;
  const kind = process.env.JOB_QUEUE ?? "memory";
  if (kind === "memory") {
    const { InProcessQueue } = await import("./memory");
    cached = new InProcessQueue();
  } else if (kind === "bullmq") {
    const { BullMQQueue } = await import("./bullmq");
    cached = new BullMQQueue();
  } else {
    throw new Error(`JOB_QUEUE tidak dikenal: ${kind}`);
  }
  return cached;
}

// Handler registration dilakukan sekali per proses. Untuk in-process, ini di-panggil
// dari boot (mis. src/instrumentation.ts). Untuk BullMQ worker, dari worker script.
let registered = false;
export async function ensureHandlersRegistered() {
  if (registered) return;
  const q = await queue();
  const { registerAllHandlers } = await import("./handlers");
  registerAllHandlers(q);
  registered = true;
}
