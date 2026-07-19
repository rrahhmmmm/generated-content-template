import { LocalStorageAdapter } from "./local";

export type StoredObject = {
  key: string;
  size: number;
  contentType: string;
};

export interface StorageAdapter {
  put(key: string, buffer: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<{ buffer: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}

let cached: StorageAdapter | null = null;

export function storage(): StorageAdapter {
  if (cached) return cached;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    cached = new LocalStorageAdapter({
      baseDir: process.env.STORAGE_LOCAL_DIR ?? "./storage",
      publicPrefix: "/api/uploads/local",
    });
  } else if (driver === "r2") {
    // Fase 3
    throw new Error("R2 storage adapter belum diimplementasikan. Lihat plan.md Fase 3.");
  } else {
    throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
  }
  return cached;
}
