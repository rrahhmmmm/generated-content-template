import type { StorageAdapter, StoredObject } from "./index";

// Stub — implementasi penuh di Fase 3 dengan @aws-sdk/client-s3 (R2 S3-compatible).
export class R2StorageAdapter implements StorageAdapter {
  constructor(_opts: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicUrl: string;
  }) {
    void _opts;
  }

  async put(_key: string, _buffer: Buffer, _contentType: string): Promise<StoredObject> {
    throw new Error("R2StorageAdapter.put — belum diimplementasikan (Fase 3).");
  }
  async get(_key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    throw new Error("R2StorageAdapter.get — belum diimplementasikan (Fase 3).");
  }
  async delete(_key: string): Promise<void> {
    throw new Error("R2StorageAdapter.delete — belum diimplementasikan (Fase 3).");
  }
  getPublicUrl(_key: string): string {
    throw new Error("R2StorageAdapter.getPublicUrl — belum diimplementasikan (Fase 3).");
  }
}
