import type { JobQueue, TaskHandler, TaskPayloads, TaskType } from "./index";

// In-process fire-and-forget queue. Enqueue → setImmediate → run handler async
// tanpa blocking caller. Cocok untuk dev/local. Tidak durable, tidak retry.
export class InProcessQueue implements JobQueue {
  readonly id = "memory";
  private handlers = new Map<TaskType, TaskHandler<TaskType>>();
  private inflight = new Set<Promise<void>>();

  registerHandler<T extends TaskType>(type: T, handler: TaskHandler<T>): void {
    this.handlers.set(type, handler as TaskHandler<TaskType>);
  }

  async enqueue<T extends TaskType>(type: T, payload: TaskPayloads[T]): Promise<void> {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`Tidak ada handler terdaftar untuk task '${type}'. Panggil ensureHandlersRegistered().`);
    }
    // Jalankan di setImmediate agar caller (POST /api/jobs) balas dulu ke client.
    const promise = new Promise<void>((resolve) => {
      setImmediate(async () => {
        try {
          await handler(payload as TaskPayloads[TaskType]);
        } catch (err) {
          console.error(`[queue/memory] handler '${type}' gagal:`, err);
        } finally {
          resolve();
        }
      });
    });
    this.inflight.add(promise);
    promise.finally(() => this.inflight.delete(promise));
  }

  async shutdown(): Promise<void> {
    // Tunggu semua handler in-flight selesai (untuk test/CLI).
    await Promise.allSettled([...this.inflight]);
  }
}
