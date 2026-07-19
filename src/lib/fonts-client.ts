import opentype from "opentype.js";

// Browser-only font loader — fetch dari /fonts/{file} yang di-serve dari public/fonts/.
// Cache di module scope agar tidak fetch ulang tiap render.
const clientCache = new Map<string, Promise<opentype.Font>>();

export function loadFontClient(fontFile: string): Promise<opentype.Font> {
  const existing = clientCache.get(fontFile);
  if (existing) return existing;
  const p = fetch(`/fonts/${fontFile}`)
    .then((r) => {
      if (!r.ok) throw new Error(`Gagal load font ${fontFile}: ${r.status}`);
      return r.arrayBuffer();
    })
    .then((ab) => opentype.parse(ab));
  clientCache.set(fontFile, p);
  return p;
}
