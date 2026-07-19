import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import type { StorageAdapter, StoredObject } from "./index";

// Cloudflare R2 = S3-compatible. Perbedaan: endpoint pakai account_id, region "auto".
// Public URL biasanya dari custom domain / R2.dev subdomain.
export class R2StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(opts: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    publicUrl: string;
  }) {
    this.bucket = opts.bucket;
    this.publicUrl = opts.publicUrl.replace(/\/+$/, "");
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${opts.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
      },
    });
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<StoredObject> {
    const cleanKey = key.replace(/^\/+/, "");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return { key: cleanKey, size: buffer.length, contentType };
  }

  async get(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const cleanKey = key.replace(/^\/+/, "");
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: cleanKey })
      );
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes) return null;
      return {
        buffer: Buffer.from(bytes),
        contentType: out.ContentType ?? "application/octet-stream",
      };
    } catch (err) {
      if (err instanceof NoSuchKey) return null;
      if (err instanceof Error && err.name === "NoSuchKey") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const cleanKey = key.replace(/^\/+/, "");
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: cleanKey }));
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key.replace(/^\/+/, "")}`;
  }
}
