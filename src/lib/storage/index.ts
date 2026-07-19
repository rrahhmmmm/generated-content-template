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
    const need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;
    for (const k of need) if (!process.env[k]) throw new Error(`${k} wajib di-set untuk STORAGE_DRIVER=r2`);
    // Lazy import — hindari memuat @aws-sdk saat driver lokal.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { R2StorageAdapter } = require("./r2") as typeof import("./r2");
    cached = new R2StorageAdapter({
      accountId: process.env.R2_ACCOUNT_ID!,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      bucket: process.env.R2_BUCKET!,
      publicUrl: process.env.R2_PUBLIC_URL!,
    });
  } else {
    throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
  }
  return cached;
}
