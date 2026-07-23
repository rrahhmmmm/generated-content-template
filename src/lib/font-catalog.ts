export type FontCategory = "display" | "serif" | "sans";

export type FontOption = {
  filename: string;
  label: string;
  category: FontCategory;
};

export const FONT_CATALOG: FontOption[] = [
  // Display / heading tebal — cocok untuk thumbnail text besar
  { filename: "Anton-Regular.ttf",         label: "Anton",              category: "display" },
  { filename: "BebasNeue-Regular.ttf",     label: "Bebas Neue",         category: "display" },
  { filename: "Oswald-Variable.ttf",       label: "Oswald",             category: "display" },
  { filename: "ArchivoBlack-Regular.ttf",  label: "Archivo Black",      category: "display" },
  { filename: "FjallaOne-Regular.ttf",     label: "Fjalla One",         category: "display" },
  { filename: "AlfaSlabOne-Regular.ttf",   label: "Alfa Slab One",      category: "display" },
  { filename: "PassionOne-Black.ttf",      label: "Passion One Black",  category: "display" },
  { filename: "Ultra-Regular.ttf",         label: "Ultra",              category: "display" },
  { filename: "RubikMonoOne-Regular.ttf",  label: "Rubik Mono One",     category: "display" },
  { filename: "Staatliches-Regular.ttf",   label: "Staatliches",        category: "display" },

  // Serif / editorial
  { filename: "PlayfairDisplay-Variable.ttf",  label: "Playfair Display",  category: "serif" },
  { filename: "DMSerifDisplay-Regular.ttf",    label: "DM Serif Display",  category: "serif" },
  { filename: "Merriweather-Variable.ttf",     label: "Merriweather",      category: "serif" },
  { filename: "LibreBodoni-Variable.ttf",      label: "Libre Bodoni",      category: "serif" },
  { filename: "BodoniModa-Variable.ttf",       label: "Bodoni Moda",       category: "serif" },
  { filename: "CormorantGaramond-Variable.ttf",label: "Cormorant Garamond",category: "serif" },

  // Sans
  { filename: "Inter-Black.ttf",            label: "Inter Black",             category: "sans" },
  { filename: "Montserrat-Variable.ttf",    label: "Montserrat",              category: "sans" },
  // Arial Black: proprietary Microsoft. Tidak dicommit ke repo — di-copy dari
  // system font macOS/Windows lewat `pnpm fonts:fetch`. Kalau server produksi
  // tidak punya file ini, jangan pilih opsi ini (render akan gagal jelas).
  { filename: "ArialBlack.ttf",             label: "Arial Black",             category: "sans" },
];

export const FONT_CATEGORY_LABEL: Record<FontCategory, string> = {
  display: "Display / Heading",
  serif: "Serif / Editorial",
  sans: "Sans-serif",
};

export function groupFontsByCategory(): Record<FontCategory, FontOption[]> {
  const groups: Record<FontCategory, FontOption[]> = { display: [], serif: [], sans: [] };
  for (const f of FONT_CATALOG) groups[f.category].push(f);
  return groups;
}
