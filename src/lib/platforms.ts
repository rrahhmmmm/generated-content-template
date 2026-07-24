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

// Default aspect ratio per platform untuk thumbnail generator. Digunakan sebagai
// fallback kalau akun belum punya template; kalau punya, template.width/height
// yang jadi source of truth (akun boleh customize).
export const PLATFORM_ASPECT: Record<Platform, { w: number; h: number }> = {
  TIKTOK: { w: 1080, h: 1920 },
  INSTAGRAM: { w: 1080, h: 1920 },
  YOUTUBE: { w: 1080, h: 1920 }, // Shorts default; override via template
};
