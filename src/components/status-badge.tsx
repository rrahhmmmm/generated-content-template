import { Badge } from "@/components/ui/badge";

export type RenditionStatus = "PENDING" | "WRITING" | "RENDERING" | "DONE" | "FAILED";

const MAP: Record<RenditionStatus, { tone: "muted" | "accent" | "success" | "danger"; label: string }> = {
  PENDING:   { tone: "muted",   label: "Menunggu" },
  WRITING:   { tone: "accent",  label: "Menulis caption" },
  RENDERING: { tone: "accent",  label: "Merender" },
  DONE:      { tone: "success", label: "Selesai" },
  FAILED:    { tone: "danger",  label: "Gagal" },
};

export function StatusBadge({ status }: { status: RenditionStatus }) {
  const m = MAP[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
