import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output — shrink Railway image (~800MB → ~300MB). Runtime hanya
  // butuh .next/standalone + .next/static + public/, tidak seluruh node_modules.
  output: "standalone",
  // Package berbasis native binary / dynamic require harus dijalankan sebagai
  // module Node.js asli (bukan di-bundle Turbopack). Kalau di-bundle, __dirname
  // di-rewrite dan resolusi path binary rusak (mis. ffmpeg-static → /ROOT/...).
  serverExternalPackages: [
    "ffmpeg-static",
    "opentype.js",
    "bullmq",
    "ioredis",
    "@prisma/client",
    "prisma",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
  ],
};

export default nextConfig;
