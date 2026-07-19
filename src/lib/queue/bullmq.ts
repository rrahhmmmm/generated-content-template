import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import type { JobQueue, TaskHandler, TaskPayloads, TaskType } from "./index";

const QUEUE_NAME = "gencontent";
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? "3");

// Redis-backed durable queue. Enqueue dari Next.js, konsumsi dari `pnpm worker`.
// Set concurrency=3 sesuai plan.md §5 (FFmpeg preset veryfast di 8 vCPU).
export class BullMQQueue implements JobQueue {
  readonly id = "bullmq";
  private connection: IORedis;
  private queue: Queue;
  private handlers = new Map<TaskType, TaskHandler<TaskType>>();
  private worker: Worker | null = null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL wajib di-set untuk JOB_QUEUE=bullmq");
    // BullMQ butuh maxRetriesPerRequest=null.
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
  }

  registerHandler<T extends TaskType>(type: T, handler: TaskHandler<T>): void {
    this.handlers.set(type, handler as TaskHandler<TaskType>);
  }

  async enqueue<T extends TaskType>(type: T, payload: TaskPayloads[T]): Promise<void> {
    await this.queue.add(type, payload, {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    });
  }

  async startWorker(): Promise<void> {
    if (this.worker) return;
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        const handler = this.handlers.get(job.name as TaskType);
        if (!handler) throw new Error(`Handler tidak terdaftar: ${job.name}`);
        await handler(job.data);
      },
      { connection: this.connection, concurrency: CONCURRENCY }
    );

    this.worker.on("failed", (job, err) => {
      console.error(`[queue/bullmq] job ${job?.id} gagal:`, err);
    });
    this.worker.on("completed", (job) => {
      console.log(`[queue/bullmq] job ${job.id} (${job.name}) selesai`);
    });
    console.log(`[queue/bullmq] worker aktif, concurrency=${CONCURRENCY}`);
  }

  async shutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
