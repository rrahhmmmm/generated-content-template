import { EmptyState } from "@/components/empty-state";
import { History } from "lucide-react";

export default function JobsPage() {
  return (
    <EmptyState
      icon={History}
      title="Belum tersedia"
      description="Riwayat job akan tampil di sini setelah Fase 3 (queue & worker) selesai."
    />
  );
}
