import opentype from "opentype.js";
import { promises as fs } from "node:fs";
import path from "node:path";

// Server-only font loader. Untuk browser gunakan @/lib/fonts-client.
const cache = new Map<string, opentype.Font>();

const FONT_DIRS = [path.resolve(process.cwd(), "public/fonts")];

async function locate(fontFile: string): Promise<string> {
  for (const dir of FONT_DIRS) {
    const p = path.join(dir, fontFile);
    try {
      await fs.access(p);
      return p;
    } catch {
      // try next
    }
  }
  throw new Error(`Font tidak ditemukan: ${fontFile}. Taruh di public/fonts/.`);
}

export async function loadFont(fontFile: string): Promise<opentype.Font> {
  const cached = cache.get(fontFile);
  if (cached) return cached;
  const filePath = await locate(fontFile);
  const buffer = await fs.readFile(filePath);
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const font = opentype.parse(ab);
  cache.set(fontFile, font);
  return font;
}
