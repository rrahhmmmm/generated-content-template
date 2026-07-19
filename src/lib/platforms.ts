// Platform bukan enum di Prisma (SQLite) — jaga daftar valid di aplikasi.
export const PLATFORMS = ["TIKTOK", "INSTAGRAM", "YOUTUBE"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
};

export const PLATFORM_THUMB_MAX: Record<Platform, number> = {
  TIKTOK: 80,
  INSTAGRAM: 80,
  YOUTUBE: 100,
};
