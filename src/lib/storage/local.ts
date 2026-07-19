import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageAdapter, StoredObject } from "./index";

const META_SUFFIX = ".meta.json";

export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;
  private publicPrefix: string;

  constructor(opts: { baseDir: string; publicPrefix: string }) {
    this.baseDir = path.resolve(opts.baseDir);
    this.publicPrefix = opts.publicPrefix;
  }

  private full(key: string) {
    // Prevent path traversal — keys must be relative and not escape baseDir
    const safe = key.replace(/^\/+/, "");
    const resolved = path.resolve(this.baseDir, safe);
    if (!resolved.startsWith(this.baseDir + path.sep) && resolved !== this.baseDir) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return resolved;
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<StoredObject> {
    const full = this.full(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    await fs.writeFile(full + META_SUFFIX, JSON.stringify({ contentType }));
    return { key, size: buffer.length, contentType };
  }

  async get(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const full = this.full(key);
    try {
      const buffer = await fs.readFile(full);
      let contentType = "application/octet-stream";
      try {
        const meta = JSON.parse(await fs.readFile(full + META_SUFFIX, "utf-8"));
        contentType = meta.contentType ?? contentType;
      } catch {
        // no meta — fall back
      }
      return { buffer, contentType };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const full = this.full(key);
    await Promise.all([
      fs.unlink(full).catch(() => {}),
      fs.unlink(full + META_SUFFIX).catch(() => {}),
    ]);
  }

  getPublicUrl(key: string): string {
    return `${this.publicPrefix}/${key.replace(/^\/+/, "")}`;
  }
}
